#!/usr/bin/env node
/**
 * Command line entry point.
 *
 * Three things, deliberately: run one goal against a live site, run the task suite, and
 * read back a run's evidence. No socket, no pairing, no background service — the CLI is
 * the shortest path from a goal to a verified result, and the easiest thing to debug when
 * something goes wrong.
 */

import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalBrowser } from "../core/browser.ts";
import { evaluateTask } from "../core/evaluator.ts";
import { Ledger } from "../core/ledger.ts";
import { coreRoot } from "../core/paths.ts";
import { PlanStore } from "../core/plan.ts";
import { parsePredicate } from "../core/predicates.ts";
import { GoalStore } from "../core/state.ts";
import { TaskStore } from "../core/task.ts";
import type { Predicate } from "../core/types.ts";
import { createLiveModel } from "../runtime/model.ts";
import { runTaskWithDeclineRetry } from "../runtime/runtime.ts";

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index++) {
    const token = rest[index]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      // Repeated flags collect into a comma-joined value, so --criterion can be given twice.
      flags[name] = flags[name] === undefined ? next : `${String(flags[name])},${next}`;
      index += 1;
    }
  }

  return { command, positional, flags };
}

function flagString(flags: ParsedArgs["flags"], name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function flagList(flags: ParsedArgs["flags"], name: string): string[] {
  return (flagString(flags, name) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** `--criterion "text_visible:Thanks"` or raw JSON for the full predicate language. */
export function parseCriterion(raw: string): Predicate {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return parsePredicate(JSON.parse(trimmed));
  const separator = trimmed.indexOf(":");
  if (separator < 0) {
    return parsePredicate({ kind: "text_visible", text: trimmed });
  }
  const kind = trimmed.slice(0, separator).trim();
  const rest = trimmed.slice(separator + 1).trim();
  if (kind === "value_includes" || kind === "value_equals") {
    const [name, ...value] = rest.split("=");
    return parsePredicate({ kind, name: (name ?? "").trim(), text: value.join("=").trim() });
  }
  if (kind === "control_exists" || kind === "control_absent") {
    return parsePredicate({ kind, name: rest });
  }
  return parsePredicate({ kind, text: rest });
}

const HELP = `browser-agent — drive a browser toward a verified goal

Usage:
  browser-agent run "<goal>" --url <url> [options]
  browser-agent suite [--target mock|reference|live] [options]
  browser-agent replay <goalId> [--root <dir>]

run options:
  --url <url>              page to start from (required)
  --criterion <spec>       success criterion; repeatable. "Thanks" or
                           "text_visible:Thanks" or "value_includes:Email=ada"
                           or raw JSON. Defaults to asking the model to report only.
  --policy auto|ask|never  irreversible actions (default: ask)
  --max-turns <n>          turn budget (default: 16)
  --model <provider/id>    override model selection
  --headed                 show the browser
  --root <dir>             where evidence goes (default: ~/.browser-agent-core)
  --json                   machine-readable result on stdout

suite options:
  --target mock            token-free: real loop, mock model (default)
  --target reference       no model at all: validates the tasks themselves
  --target live            real model; costs tokens
  --smoke                  a small representative subset (live default)
  --all                    every task
  --only <id,id>           specific task ids
  --tags <tag,tag>         tasks carrying any of these tags
  --out <file>             write the JSON report
  --pause <ms>             gap between tasks (live default: 2000)

replay options:
  --root <dir>             evidence root
`;

async function commandRun(args: ParsedArgs): Promise<number> {
  const goal = args.positional.join(" ").trim();
  const url = flagString(args.flags, "url");
  if (!goal || !url) {
    process.stderr.write("run needs a goal and --url\n\n" + HELP);
    return 2;
  }

  const criteria = flagList(args.flags, "criterion").map(parseCriterion);
  const policy = (flagString(args.flags, "policy") ?? "ask") as "auto" | "ask" | "never";
  const maxTurns = Number(flagString(args.flags, "max-turns") ?? 16);
  const root = flagString(args.flags, "root") ?? coreRoot();
  const goalId = PlanStore.newGoalId();

  const live = await createLiveModel({ model: flagString(args.flags, "model") });
  const browser = await LocalBrowser.launch({ headless: !args.flags.headed });
  const ledger = await Ledger.open(root, goalId);
  const store = await TaskStore.open(root, goalId);
  const goalStore = await GoalStore.open(root, goalId, goal);

  // A goal with no stated criteria still gets one, so "did it work" has an answer.
  const effective = criteria.length > 0 ? criteria : [{ kind: "url_includes" as const, text: "" }];
  const task = await store.create({ objective: goal, criteria: effective, maxTurns });

  try {
    const tab = await browser.openTab(url);
    process.stderr.write(`goal ${goalId} — ${live.name}\nevidence ${root}/goals/${goalId}\n`);

    const attempt = await runTaskWithDeclineRetry({
      card: { objective: goal, criteria: effective, startUrl: url, policy },
      maxTurns,
      stream: live.stream,
      model: live.model,
      tools: {
        browser,
        tabId: tab,
        ledger,
        goalRoot: root,
        goalId,
        goalStore,
        policy,
        screenshotDir: ledger.artifactsDir,
        askUser: async (question) => {
          process.stderr.write(`\nThe agent needs an answer: ${question}\n`);
          return undefined;
        },
        approve: async (request) => {
          process.stderr.write(
            `\nApproval needed: ${request.request.kind} — ${request.reason}\n` +
              `Re-run with --policy auto to allow it.\n`,
          );
          return false;
        },
      },
      // A refusal gets one more chance with whatever the agent established about the
      // situation, in case it declined only because it could not tell where it stood.
      factsOnRetry: async () => (await goalStore.goal()).facts,
    });

    const outcome = attempt.outcome;

    const evaluation = await evaluateTask({
      store,
      taskId: task.taskId,
      browser,
      ledger,
      tabId: tab,
      claim: outcome.report?.summary,
      capped: outcome.capped,
      sessionError: outcome.error ?? outcome.modelErrors[0],
      declined: outcome.declined,
    });

    const result = {
      goalId,
      status: evaluation.status,
      claimed: outcome.report ?? null,
      turns: outcome.turns,
      tokens: outcome.tokens,
      costUsd: Number(outcome.costUsd.toFixed(6)),
      checks: evaluation.verification.checks,
    };

    if (args.flags.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(
        `\n${evaluation.status.toUpperCase()} after ${outcome.turns} turns ` +
          `(${outcome.tokens} tokens, $${outcome.costUsd.toFixed(4)})\n`,
      );
      for (const check of evaluation.verification.checks) {
        process.stdout.write(`  ${check.passed ? "pass" : "FAIL"} ${check.predicate}\n`);
      }
      if (outcome.report) {
        process.stdout.write(`  agent said: ${outcome.report.status} — ${outcome.report.summary}\n`);
      }
      if (outcome.declined) {
        process.stdout.write(`  the agent declined and took no action: ${outcome.declined}\n`);
      }
    }

    return evaluation.status === "success" ? 0 : 1;
  } finally {
    await browser.close();
  }
}

async function commandSuite(args: ParsedArgs): Promise<number> {
  const [{ runSuite, formatReport }, { SUITE_TASKS }, { selectTasks }] = await Promise.all([
    import("../suite/runner.ts"),
    import("../suite/tasks.ts"),
    import("../suite/tags.ts"),
  ]);
  const { FixtureServer } = await import("../../tests/helpers/fixture-server.ts");

  const target = flagString(args.flags, "target") ?? "mock";
  const smoke = target === "live" ? !args.flags.all : Boolean(args.flags.smoke);
  const tasks = selectTasks(SUITE_TASKS, {
    only: flagList(args.flags, "only"),
    tags: flagList(args.flags, "tags"),
    smoke,
  });

  if (tasks.length === 0) {
    process.stderr.write("no tasks matched the selection\n");
    return 2;
  }

  const server = new FixtureServer();
  const origin = await server.start();
  const root = flagString(args.flags, "root") ?? (await mkdtemp(path.join(os.tmpdir(), "suite-")));

  try {
    const driver = await buildDriver(target, root, flagString(args.flags, "model"));
    process.stderr.write(`${tasks.length} task(s), target ${driver.name}, evidence ${root}\n`);

    const report = await runSuite({
      tasks,
      driver,
      origin,
      headless: !args.flags.headed,
      pauseMs: Number(flagString(args.flags, "pause") ?? (target === "live" ? 2000 : 0)),
      onTask: (run) => {
        process.stderr.write(
          `  ${(run.outcome === "passed" ? "ok" : run.outcome).padEnd(6)} ${run.id} ` +
            `(${run.steps} steps)\n`,
        );
        if (run.outcome !== "passed") process.stderr.write(`         ${run.detail}\n`);
      },
    });

    const out = flagString(args.flags, "out");
    if (out) {
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      process.stderr.write(`wrote ${out}\n`);
    }

    process.stdout.write(`${formatReport(report)}\n`);
    return report.valid ? 0 : 1;
  } finally {
    await server.stop();
  }
}

async function buildDriver(target: string, root: string, model?: string) {
  const { ReferenceDriver } = await import("../suite/reference-driver.ts");
  if (target === "reference") return new ReferenceDriver();

  const { RuntimeDriver } = await import("../suite/runtime-driver.ts");
  const { createMockModel } = await import("../runtime/mock-model.ts");
  const { planForTask } = await import("../suite/mock-plan.ts");

  if (target === "mock") {
    return new RuntimeDriver({
      name: "mock",
      root,
      policy: "auto",
      answers: { name: "Ada Lovelace", email: "ada@example.com", password: "hunter2" },
      createStream: (task, origin) => createMockModel({ plan: planForTask(task, origin) }),
    });
  }

  if (target === "live") {
    const live = await createLiveModel({ model });
    process.stderr.write(`live model: ${live.name}\n`);
    return new RuntimeDriver({
      name: `live:${live.name}`,
      root,
      model: live.model,
      // Fixtures are disposable, so a live run commits without pausing for a human.
      policy: "auto",
      answers: { name: "Ada Lovelace", email: "ada@example.com", password: "hunter2" },
      createStream: () => live.stream,
    });
  }

  throw new Error(`unknown target "${target}". Available: mock, reference, live.`);
}

async function commandReplay(args: ParsedArgs): Promise<number> {
  const goalId = args.positional[0];
  if (!goalId) {
    process.stderr.write("replay needs a goal id\n");
    return 2;
  }
  const root = flagString(args.flags, "root") ?? coreRoot();
  const events = await Ledger.readFrom(root, goalId);
  if (events.length === 0) {
    process.stderr.write(`no evidence for ${goalId} under ${root}\n`);
    return 1;
  }
  for (const event of events) {
    const mark = event.outcome ? (event.outcome.ok ? "ok  " : "FAIL") : "    ";
    const action = event.action ? `${event.action.kind} ${event.action.ref ?? event.action.url ?? ""}` : "";
    process.stdout.write(
      `${mark} ${event.type.padEnd(14)} ${(event.intent ?? action).slice(0, 70)}\n`,
    );
    if (event.outcome?.detail) {
      process.stdout.write(`         ${event.outcome.detail.slice(0, 100)}\n`);
    }
  }
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "run":
      return commandRun(args);
    case "suite":
      return commandSuite(args);
    case "replay":
      return commandReplay(args);
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;
    default:
      process.stderr.write(`unknown command "${args.command}"\n\n${HELP}`);
      return 2;
  }
}

export { HELP };
