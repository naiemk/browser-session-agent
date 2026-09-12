/**
 * PARENT-01-T03 / R6.E2 — OpenRouter supervisor proxy suite.
 *
 * Live model is only the supervisor. Magpie is faked on PATH. No Chrome.
 * Caps: USD 0.25, 16 supervisor turns across all cases.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { admitParentPlan } from "../src/host/parent-plan.ts";
import {
  countStarts,
  parseFakeMagpieArgs,
  readFakeMagpieArgvLog,
} from "../tests/helpers/fake-magpie.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "tests", "fixtures", "parent-supervisor");
const SKILL = path.join(ROOT, "skills", "parent-supervisor", "SKILL.md");
const FAKE_BIN = path.join(ROOT, "bin", "fake-magpie.mjs");

const MAX_USD = 0.25;
const MAX_TURNS = 16;
const DEFAULT_MODEL = "google/gemini-2.5-flash";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface CaseResult {
  id: string;
  pass: boolean;
  detail: string;
  turns: number;
  usd: number;
}

interface SupervisorBudget {
  turns: number;
  usd: number;
}

async function loadDotEnv(): Promise<void> {
  try {
    const body = await readFile(path.join(ROOT, ".env"), "utf8");
    for (const line of body.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function redact(text: string): string {
  return text
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "sk-or-v1-[REDACTED]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "sk-[REDACTED]")
    .replace(/OPENROUTER_API_KEY=[^\s]+/g, "OPENROUTER_API_KEY=[REDACTED]");
}

async function runCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-lc", command], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the working directory. Use for magpie.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a text file relative to the working directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
];

async function openRouterChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  budget: SupervisorBudget,
): Promise<{ message: ChatMessage; usd: number }> {
  if (budget.turns >= MAX_TURNS) {
    throw new Error(`supervisor turn cap ${MAX_TURNS} exceeded`);
  }
  if (budget.usd >= MAX_USD) {
    throw new Error(`supervisor cost cap USD ${MAX_USD} exceeded`);
  }
  budget.turns += 1;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/naiemk/browser-session-agent",
      "X-Title": "magpie-parent-supervisor",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${redact(text).slice(0, 500)}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: ChatMessage }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
      total_cost?: number;
    };
  };
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error("OpenRouter returned no message");

  let usd = 0;
  if (typeof body.usage?.cost === "number") usd = body.usage.cost;
  else if (typeof body.usage?.total_cost === "number") usd = body.usage.total_cost;
  else {
    const inTok = body.usage?.prompt_tokens ?? 0;
    const outTok = body.usage?.completion_tokens ?? 0;
    usd = (inTok * 0.3 + outTok * 2.5) / 1_000_000;
  }
  budget.usd += usd;
  if (budget.usd > MAX_USD) {
    throw new Error(
      `supervisor cost cap USD ${MAX_USD} exceeded (spent ~${budget.usd.toFixed(4)})`,
    );
  }
  return { message, usd };
}

async function runSupervisorTurn(options: {
  apiKey: string;
  model: string;
  skill: string;
  user: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  budget: SupervisorBudget;
  maxRounds?: number;
}): Promise<{ assistantText: string; rounds: number; usd: number }> {
  const messages: ChatMessage[] = [
    { role: "system", content: options.skill },
    {
      role: "system",
      content: `Working directory: ${options.cwd}\nMAGPIE_SESSION_DIR is set. Prefer: magpie --json --session-dir "$MAGPIE_SESSION_DIR" …`,
    },
    { role: "user", content: options.user },
  ];
  let assistantText = "";
  let rounds = 0;
  let usd = 0;
  const maxRounds = options.maxRounds ?? 4;

  while (rounds < maxRounds) {
    rounds += 1;
    const { message, usd: turnUsd } = await openRouterChat(
      options.apiKey,
      options.model,
      messages,
      options.budget,
    );
    usd += turnUsd;
    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    });
    if (message.content) assistantText += message.content;

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) break;

    for (const call of calls) {
      const name = call.function.name;
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, string>;
      } catch {
        args = {};
      }
      let toolResult = "";
      if (name === "write_file") {
        const rel = args.path ?? "out.txt";
        const dest = path.resolve(options.cwd, rel);
        if (!dest.startsWith(options.cwd)) {
          toolResult = "error: path escapes working directory";
        } else {
          await mkdir(path.dirname(dest), { recursive: true });
          await writeFile(dest, args.content ?? "", "utf8");
          toolResult = `wrote ${rel}`;
        }
      } else if (name === "run_command") {
        const result = await runCommand(args.command ?? "", options.cwd, options.env);
        toolResult = redact(
          `exit=${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        ).slice(0, 8000);
      } else {
        toolResult = `unknown tool ${name}`;
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: toolResult,
      });
    }
  }

  return { assistantText, rounds, usd };
}

async function main(): Promise<void> {
  await loadDotEnv();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    process.stdout.write("skip: OPENROUTER_API_KEY unset (parent-supervisor)\n");
    process.exit(0);
  }

  const model = (process.env.PARENT_SUPERVISOR_MODEL ?? DEFAULT_MODEL).replace(/^openrouter\//, "");
  const skill = await readFile(SKILL, "utf8");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const traceDir = path.join(ROOT, "results", "parent-supervisor", stamp);
  await mkdir(traceDir, { recursive: true });

  const work = await mkdtemp(path.join(os.tmpdir(), "bsa-parent-sup-"));
  const fakeState = path.join(work, "fake-state");
  const sessionDir = path.join(work, "sessions");
  const privateBin = path.join(work, "bin");
  await mkdir(fakeState, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await mkdir(privateBin, { recursive: true });
  await writeFile(
    path.join(privateBin, "magpie"),
    `#!/bin/bash\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_BIN)} "$@"\n`,
    { mode: 0o755 },
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${privateBin}${path.delimiter}${process.env.PATH ?? ""}`,
    FAKE_MAGPIE_STATE: fakeState,
    MAGPIE_SESSION_DIR: sessionDir,
    HOME: work,
    BSA_CORE_HOME: work,
  };

  const budget: SupervisorBudget = { turns: 0, usd: 0 };
  const results: CaseResult[] = [];
  let sessionId: string | undefined;

  const readFixture = async (name: string) =>
    (await readFile(path.join(FIXTURES, name), "utf8")).trim();

  try {
    // tiny_lookup
    {
      const before = (await readFakeMagpieArgvLog(fakeState)).length;
      const user = await readFixture("tiny_lookup.txt");
      const turn = await runSupervisorTurn({
        apiKey,
        model,
        skill,
        user,
        cwd: work,
        env,
        budget,
        maxRounds: 3,
      });
      const newArgv = (await readFakeMagpieArgvLog(fakeState)).slice(before);
      const started = countStarts(newArgv);
      const pass = started === 0;
      results.push({
        id: "tiny_lookup",
        pass,
        detail: pass ? "no magpie start" : `unexpected starts=${started}`,
        turns: turn.rounds,
        usd: turn.usd,
      });
      await writeFile(
        path.join(traceDir, "tiny_lookup.json"),
        redact(JSON.stringify({ user, turn, newArgv, pass }, null, 2)),
      );
    }

    // harvest_delegate
    {
      const before = (await readFakeMagpieArgvLog(fakeState)).length;
      const user = await readFixture("harvest_delegate.txt");
      const turn = await runSupervisorTurn({
        apiKey,
        model,
        skill,
        user,
        cwd: work,
        env,
        budget,
        maxRounds: 4,
      });
      const newArgv = (await readFakeMagpieArgvLog(fakeState)).slice(before);
      const starts = countStarts(newArgv);
      let planBody = "";
      try {
        planBody = await readFile(path.join(work, "plan.md"), "utf8");
      } catch {
        planBody = "";
      }
      const startArgv = newArgv.find((argv) => {
        const p = parseFakeMagpieArgs(argv);
        return !p.session && (p.json || Boolean(p.planFile) || p.rest.length > 0);
      });
      const parsedStart = startArgv ? parseFakeMagpieArgs(startArgv) : undefined;
      const storeRaw = await readFile(path.join(fakeState, "sessions.json"), "utf8").catch(
        () => "{}",
      );
      const store = JSON.parse(storeRaw) as Record<string, { session_id: string }>;
      const ids = Object.keys(store);
      sessionId = ids[ids.length - 1];

      const pass =
        starts === 1 &&
        Boolean(planBody.trim()) &&
        Boolean(parsedStart?.json || parsedStart?.sessionDir || parsedStart?.planFile) &&
        Boolean(sessionId);
      results.push({
        id: "harvest_delegate",
        pass,
        detail: pass
          ? `session=${sessionId}`
          : `starts=${starts} plan=${planBody ? "yes" : "no"} session=${sessionId ?? "none"}`,
        turns: turn.rounds,
        usd: turn.usd,
      });
      await writeFile(
        path.join(traceDir, "harvest_delegate.json"),
        redact(JSON.stringify({ user, turn, newArgv, planBody, sessionId, pass }, null, 2)),
      );
    }

    // plan_quality — no LLM
    {
      let planBody = "";
      try {
        planBody = await readFile(path.join(work, "plan.md"), "utf8");
      } catch {
        planBody = "";
      }
      const admitted = admitParentPlan({
        objective: "Qualify about 50 indie SaaS founders",
        planText: planBody,
      });
      const hasGoal = /##\s*Goal/i.test(planBody) || /\bgoal\b/i.test(planBody);
      const hasStop =
        /##\s*(Stop|Missing inputs|Constraints)/i.test(planBody) ||
        /\b(stop|constraint|missing)\b/i.test(planBody);
      const dirty = /click\s*\(|type\s+into|querySelector|css\s*selector/i.test(planBody);
      const pass = Boolean(planBody.trim()) && hasGoal && hasStop && !dirty;
      results.push({
        id: "plan_quality",
        pass,
        detail: pass
          ? `admission=${admitted.class}`
          : `goal=${hasGoal} stop=${hasStop} dirty=${dirty} empty=${!planBody.trim()}`,
        turns: 0,
        usd: 0,
      });
      await writeFile(
        path.join(traceDir, "plan_quality.json"),
        redact(JSON.stringify({ planBody, admitted, pass }, null, 2)),
      );
    }

    // status_followup
    {
      const before = (await readFakeMagpieArgvLog(fakeState)).length;
      const user = await readFixture("status_followup.txt");
      const turn = await runSupervisorTurn({
        apiKey,
        model,
        skill: `${skill}\n\nCurrent live Magpie session_id: ${sessionId ?? "(none)"}. Reuse it.`,
        user,
        cwd: work,
        env,
        budget,
        maxRounds: 3,
      });
      const newArgv = (await readFakeMagpieArgvLog(fakeState)).slice(before);
      const starts = countStarts(newArgv);
      const resumed = newArgv.some((argv) => parseFakeMagpieArgs(argv).session === sessionId);
      const pass = Boolean(sessionId) && resumed && starts === 0;
      results.push({
        id: "status_followup",
        pass,
        detail: pass ? "same session" : `resumed=${resumed} starts=${starts}`,
        turns: turn.rounds,
        usd: turn.usd,
      });
      await writeFile(
        path.join(traceDir, "status_followup.json"),
        redact(JSON.stringify({ user, turn, newArgv, sessionId, pass }, null, 2)),
      );
    }

    // instruct_followup
    {
      const before = (await readFakeMagpieArgvLog(fakeState)).length;
      const user = await readFixture("instruct_followup.txt");
      const turn = await runSupervisorTurn({
        apiKey,
        model,
        skill: `${skill}\n\nCurrent live Magpie session_id: ${sessionId ?? "(none)"}. Reuse it.`,
        user,
        cwd: work,
        env,
        budget,
        maxRounds: 3,
      });
      const newArgv = (await readFakeMagpieArgvLog(fakeState)).slice(before);
      const starts = countStarts(newArgv);
      const match = newArgv.find((argv) => parseFakeMagpieArgs(argv).session === sessionId);
      const parsed = match ? parseFakeMagpieArgs(match) : undefined;
      const hay = `${parsed?.printPrompt ?? ""} ${match?.join(" ") ?? ""} ${turn.assistantText}`;
      const hasInstruction = /founder|agenc|email|contact/i.test(hay);
      const pass = Boolean(sessionId) && Boolean(match) && starts === 0 && hasInstruction;
      results.push({
        id: "instruct_followup",
        pass,
        detail: pass ? "instruction on same session" : `match=${Boolean(match)} starts=${starts}`,
        turns: turn.rounds,
        usd: turn.usd,
      });
      await writeFile(
        path.join(traceDir, "instruct_followup.json"),
        redact(JSON.stringify({ user, turn, newArgv, sessionId, pass }, null, 2)),
      );
    }

    // no_duplicate
    {
      const before = (await readFakeMagpieArgvLog(fakeState)).length;
      const user = await readFixture("no_duplicate.txt");
      const turn = await runSupervisorTurn({
        apiKey,
        model,
        skill: `${skill}\n\nCurrent live Magpie session_id: ${sessionId ?? "(none)"}. Do not start a second session.`,
        user,
        cwd: work,
        env,
        budget,
        maxRounds: 3,
      });
      const newArgv = (await readFakeMagpieArgvLog(fakeState)).slice(before);
      const starts = countStarts(newArgv);
      const pass = starts === 0;
      results.push({
        id: "no_duplicate",
        pass,
        detail: pass ? "no second start" : `starts=${starts}`,
        turns: turn.rounds,
        usd: turn.usd,
      });
      await writeFile(
        path.join(traceDir, "no_duplicate.json"),
        redact(JSON.stringify({ user, turn, newArgv, sessionId, pass }, null, 2)),
      );
    }
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }

  const summary = {
    date: new Date().toISOString(),
    model: `openrouter/${model}`,
    skill: "skills/parent-supervisor/SKILL.md",
    budget,
    results,
    allPass: results.every((r) => r.pass),
  };
  await writeFile(path.join(traceDir, "summary.json"), redact(JSON.stringify(summary, null, 2)));

  process.stdout.write(
    `${results.map((r) => `${r.pass ? "PASS" : "FAIL"} ${r.id} — ${r.detail}`).join("\n")}\n`,
  );
  process.stdout.write(
    `turns=${budget.turns} usd≈${budget.usd.toFixed(4)} model=openrouter/${model} traces=${traceDir}\n`,
  );

  if (budget.turns > MAX_TURNS || budget.usd > MAX_USD) {
    process.stderr.write("cap exceeded\n");
    process.exit(1);
  }
  if (!summary.allPass) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`${redact(err instanceof Error ? err.message : String(err))}\n`);
  process.exit(1);
});
