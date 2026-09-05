import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { ensureGoalDirs, goalPaths } from "../../src/core/paths.ts";
import {
  bindSubagent,
  CHAT_WORKER_HINT,
  digestText,
  DIGEST_MAX_CHARS,
  ensureScratch,
  maybeAutoPlan,
  PLAN_COMMAND,
  PLAN_DIGEST_HEADER,
  prependPlanDigest,
  shouldAutoPlan,
  SCRATCH_WRITE_TOOL_NAME,
  SUBAGENT_TOOL_NAME,
} from "../../src/host/pi-subagent/bind.ts";
import { AUTO_PLAN_TIMEOUT_MS } from "../../src/host/pi-subagent/auto-plan.ts";
import { discoverPackagedAgents, findAgent } from "../../src/host/pi-subagent/discover.ts";
import {
  buildChildInvocation,
  parsePiJsonLine,
  piCliPath,
  runWorker,
  type SpawnImpl,
} from "../../src/host/pi-subagent/spawn.ts";
import { createExtensionApi, extensionContext, MemoryOperatorHost } from "../../src/host/memory-host.ts";
import { piEntryPath } from "../../src/hosts/local-cli/launch.ts";
import { createFakePi, runCommand, runTool } from "../helpers/fake-pi.ts";
import browserSessionAgent from "../../src/extension.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length) {
    await rm(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-scratch-"));
  tmpDirs.push(dir);
  return dir;
}

function fakeChild(stdoutLines: string[], exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  Object.assign(proc, {
    stdout,
    stderr,
    killed: false,
    kill() {
      (proc as ChildProcess & { killed: boolean }).killed = true;
      return true;
    },
  });
  queueMicrotask(() => {
    for (const line of stdoutLines) stdout.emit("data", `${line}\n`);
    proc.emit("close", exitCode);
  });
  return proc;
}

describe("typed worker scratch", () => {
  it("adds scratchDir next to artifacts and creates it", async () => {
    const root = await tempRoot();
    const paths = goalPaths(root, "goal_1");
    assert.equal(paths.scratchDir, path.join(root, "goals", "goal_1", "scratch"));
    await ensureGoalDirs(paths);
    assert.equal((await stat(paths.scratchDir)).isDirectory(), true);
    assert.equal((await stat(paths.artifactsDir)).isDirectory(), true);
  });
});

describe("packaged worker agents", () => {
  it("loads four agents with the expected allowlists", () => {
    const agents = discoverPackagedAgents();
    assert.deepEqual(
      agents.map((agent) => agent.name).sort(),
      ["coder", "planner", "reviewer", "writer"],
    );

    const planner = findAgent("planner", agents)!;
    assert.ok(!planner.tools.includes("bash"), "planner has no bash");
    assert.ok(!planner.tools.includes("write"), "planner has no write");
    assert.ok(planner.tools.includes("read"));
    assert.equal(planner.model, "@ultra");

    const writer = findAgent("writer", agents)!;
    assert.ok(writer.tools.includes("write"));
    assert.ok(!writer.tools.includes("bash"));
    assert.equal(writer.description.includes("CV"), false);

    const reviewer = findAgent("reviewer", agents)!;
    assert.ok(reviewer.tools.includes("read"));
    assert.ok(!reviewer.tools.includes("write"));

    const coder = findAgent("coder", agents)!;
    assert.ok(coder.tools.includes("bash"));
    assert.ok(coder.tools.includes("write"));
  });
});

describe("worker spawn isolation", () => {
  it("resolves the same Pi CLI the local TUI uses", () => {
    assert.equal(piCliPath(ROOT), piEntryPath(ROOT));
    assert.ok(piCliPath(ROOT).endsWith(path.join("pi-coding-agent", "dist", "cli.js")));
  });

  it("builds a fresh argv: json mode, no parent extension, coding builtins on", () => {
    const invocation = buildChildInvocation({
      piEntry: "/opt/pi/cli.js",
      agent: {
        name: "planner",
        description: "plan",
        tools: ["read", "grep", "find", "ls"],
        model: "@ultra",
        thinking: "high",
        systemPrompt: "plan",
        filePath: "/tmp/planner.md",
      },
      task: "apply to three jobs",
      promptFile: "/tmp/prompt.md",
      extraExtensions: ["/opt/pi-model-auto/src/index.ts"],
    });
    assert.equal(invocation.command, process.execPath);
    assert.equal(invocation.args[0], "/opt/pi/cli.js");
    assert.ok(invocation.args.includes("--no-extensions"));
    assert.ok(invocation.args.includes("--no-session"));
    assert.ok(invocation.args.includes("--mode"));
    assert.equal(invocation.args.includes("--no-builtin-tools"), false);
    assert.equal(
      invocation.args.some((arg) => arg.endsWith(path.join("src", "extension.ts"))),
      false,
    );
    const extFlag = invocation.args.indexOf("-e");
    assert.ok(extFlag >= 0);
    assert.equal(invocation.args[extFlag + 1], "/opt/pi-model-auto/src/index.ts");
    assert.equal(invocation.args[invocation.args.indexOf("--tools") + 1], "read,grep,find,ls");
    assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], "@ultra");
    assert.ok(invocation.args.includes("Task: apply to three jobs"));
  });

  it("spawns with cwd = scratch and the isolated argv", async () => {
    const root = await tempRoot();
    const scratchDir = await ensureScratch("goal_spawn", root);
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const spawnImpl: SpawnImpl = (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      const payload = {
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "## Goal\nDo the thing" }] },
      };
      return fakeChild([JSON.stringify(payload)]);
    };

    const result = await runWorker({
      agentName: "planner",
      task: "three jobs",
      scratchDir,
      spawnImpl,
      piEntry: "/fake/cli.js",
      extraExtensions: [],
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.text, /Do the thing/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, process.execPath);
    assert.equal(calls[0]?.cwd, scratchDir);
    assert.ok(calls[0]?.cwd.endsWith(`${path.sep}scratch`));
    assert.equal(calls[0]?.args[0], "/fake/cli.js");
    assert.ok(calls[0]?.args.includes("--no-extensions"));
    assert.equal(calls[0]?.args.includes("--no-builtin-tools"), false);
    assert.equal(
      calls[0]?.args.some((arg) => arg.endsWith(path.join("src", "extension.ts"))),
      false,
    );
  });

  it("parses Pi JSONL assistant text", () => {
    const messages: Array<{ role?: string; content?: unknown }> = [];
    parsePiJsonLine("not json", messages);
    parsePiJsonLine(
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
      }),
      messages,
    );
    assert.equal(messages.length, 1);
  });
});

describe("subagent bind", () => {
  it("registers /plan, writes plan.md from the stub, and keeps bash off the parent", async () => {
    const root = await tempRoot();
    const host = new MemoryOperatorHost();
    const api = createExtensionApi(host);
    const notes: string[] = [];
    host.listeners.onNotify = (message) => notes.push(message);

    bindSubagent(api, {
      goalId: "goal_plan",
      root,
      runtime: {
        async run(input) {
          assert.equal(input.agentName, "planner");
          assert.ok(input.scratchDir.endsWith(`${path.sep}scratch`));
          return {
            agent: "planner",
            text: "## Goal\nApply to three roles.\n\n## Digest\nThree roles, one CV.",
            exitCode: 0,
            stderr: "",
            aborted: false,
          };
        },
      },
    });

    assert.equal(api.tools.has(SUBAGENT_TOOL_NAME), true);
    assert.equal(api.tools.has(SCRATCH_WRITE_TOOL_NAME), true);
    assert.deepEqual(
      [...api.tools.keys()].sort(),
      [SCRATCH_WRITE_TOOL_NAME, SUBAGENT_TOOL_NAME].sort(),
    );
    assert.equal(api.commands.has(PLAN_COMMAND), true);

    await api.commands.get(PLAN_COMMAND)!.handler(
      "apply to three roles",
      extensionContext(host),
    );
    const planFile = path.join(root, "goals", "goal_plan", "scratch", "plan.md");
    const body = await readFile(planFile, "utf8");
    assert.match(body, /Apply to three roles/);
    assert.match(notes.at(-1) ?? "", /Plan written to /);
    assert.match(notes.at(-1) ?? "", /Three roles/);

    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    assert.equal(pi.tools.has(SUBAGENT_TOOL_NAME), true);
    assert.equal(pi.tools.has(SCRATCH_WRITE_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes(SUBAGENT_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes(SCRATCH_WRITE_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes("bash"), false);
    assert.match(CHAT_WORKER_HINT, /scratch_write/);
    assert.match(CHAT_WORKER_HINT, /no shell/);
  });

  it("rejects parallel/chain and unknown agents on the tool", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    bindSubagent(pi, {
      goalId: "goal_tool",
      root,
      runtime: {
        async run() {
          throw new Error("should not spawn");
        },
      },
    });
    const chained = await runTool(pi, SUBAGENT_TOOL_NAME, {
      agent: "planner",
      task: "x",
      chain: [{ agent: "writer", task: "y" }],
    });
    assert.equal(chained.isError, true);

    const other = createFakePi();
    await other.startSession();
    bindSubagent(other, { goalId: "goal_unknown", root });
    const missing = await runTool(other, SUBAGENT_TOOL_NAME, { agent: "nope", task: "x" });
    assert.equal(missing.isError, true);
    assert.match(missing.content.map((part) => ("text" in part ? part.text : "")).join(""), /Unknown agent/);
  });

  it("caps the parent-facing digest", () => {
    const long = "a".repeat(DIGEST_MAX_CHARS + 50);
    const digest = digestText(long);
    assert.ok(digest.length < long.length);
    assert.match(digest, /\[truncated\]/);
  });

  it("exposes /plan on the hosted chat command bar", async () => {
    const source = await readFile(path.join(ROOT, "src/hosts/web/public/app.js"), "utf8");
    assert.match(source, /\["plan",/);
  });

  it("usage-notifies when /plan has no argument", async () => {
    const pi = createFakePi();
    await pi.startSession();
    bindSubagent(pi, {
      goalId: "goal_empty",
      root: await tempRoot(),
      runtime: {
        async run() {
          throw new Error("should not spawn");
        },
      },
    });
    await runCommand(pi, PLAN_COMMAND, "  ");
    assert.match(pi.notifications.at(-1) ?? "", /Usage: \/plan/);
  });

  it("writes a scratch file and rejects traversal", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    bindSubagent(pi, { goalId: "goal_scratch", root });

    const written = await runTool(pi, SCRATCH_WRITE_TOOL_NAME, {
      name: "extracts/page.md",
      content: "# Extract\n",
    });
    assert.equal(written.isError, false);
    const dest = written.details?.path;
    assert.equal(typeof dest, "string");
    assert.equal(dest, path.join(root, "goals", "goal_scratch", "scratch", "extracts", "page.md"));
    assert.equal(await readFile(String(dest), "utf8"), "# Extract\n");

    const escaped = await runTool(pi, SCRATCH_WRITE_TOOL_NAME, {
      name: "../outside.md",
      content: "nope",
    });
    assert.equal(escaped.isError, true);
  });

  it("does not put scratch_write on composeAgent", async () => {
    const { composeAgent } = await import("../../src/runtime/agent.ts");
    const { nullEvidence } = await import("../../src/runtime/evidence.ts");
    const composed = composeAgent({
      card: { objective: "x", criteria: [] },
      tools: { browser: {} as never, evidence: nullEvidence() },
    });
    assert.equal(
      composed.tools.some((tool) => (tool as { name: string }).name === SCRATCH_WRITE_TOOL_NAME),
      false,
    );
    assert.equal(
      composed.tools.some((tool) => (tool as { name: string }).name === SUBAGENT_TOOL_NAME),
      false,
    );
  });

  it("hosted customTools takes every api.tools entry, not one named tool", async () => {
    const source = await readFile(path.join(ROOT, "src/hosts/web/runtime.ts"), "utf8");
    assert.match(source, /this\.api\.tools\.values\(\)/);
    assert.match(source, /parentTools/);
    assert.equal(source.includes("tools.get(SUBAGENT_TOOL_NAME)"), false);
  });
});

describe("auto-plan heuristic", () => {
  const yes = [
    "apply to these 5 jobs using my CV",
    "find software roles and tailor a resume for each",
    "campaign: apply to YC companies",
  ];
  const no = [
    "submit this application",
    "click Apply on this page",
    "log in to LinkedIn",
    "what's on this tab",
    "/plan already forced",
    "https://example.test/apply",
    "ok",
  ];

  for (const text of yes) {
    it(`plans: ${text}`, () => {
      assert.equal(shouldAutoPlan(text), true, text);
    });
  }
  for (const text of no) {
    it(`skips: ${text}`, () => {
      assert.equal(shouldAutoPlan(text), false, text);
    });
  }
});

describe("maybeAutoPlan", () => {
  function stubPlan(text = "## Goal\nFive jobs.\n\n## Digest\nUse the CV.") {
    let calls = 0;
    return {
      calls: () => calls,
      runtime: {
        async run(input: { agentName: string; timeoutMs?: number }) {
          calls += 1;
          assert.equal(input.agentName, "planner");
          assert.equal(input.timeoutMs, AUTO_PLAN_TIMEOUT_MS);
          return {
            agent: "planner",
            text,
            exitCode: 0,
            stderr: "",
            aborted: false,
          };
        },
      },
    };
  }

  it("spawns once, prepends a digest, and skips a follow-up", async () => {
    const root = await tempRoot();
    const stub = stubPlan();
    const attempted = new Set<string>();
    const text = "apply to these 5 jobs using my CV";
    const first = await maybeAutoPlan({
      text,
      goalId: "goal_auto",
      root,
      attempted,
      runtime: stub.runtime,
    });
    assert.equal(first.planned, true);
    assert.ok(first.digest);
    const sent = prependPlanDigest(text, first.digest!);
    assert.ok(sent.includes(PLAN_DIGEST_HEADER));
    assert.match(sent, /Five jobs/);
    assert.match(sent, /---\napply to these 5 jobs using my CV/);

    const second = await maybeAutoPlan({
      text: "now apply to more jobs with my resume",
      goalId: "goal_auto",
      root,
      attempted,
      runtime: {
        async run() {
          throw new Error("should not spawn again");
        },
      },
    });
    assert.equal(second.planned, false);
    assert.equal(stub.calls(), 1);
  });

  it("skips when plan.md already exists", async () => {
    const root = await tempRoot();
    const scratch = await ensureScratch("goal_exists", root);
    await writeFile(path.join(scratch, "plan.md"), "## Goal\nAlready planned.\n", "utf8");
    const result = await maybeAutoPlan({
      text: "apply to these 5 jobs using my CV",
      goalId: "goal_exists",
      root,
      attempted: new Set(),
      runtime: {
        async run() {
          throw new Error("should not spawn");
        },
      },
    });
    assert.equal(result.planned, false);
  });

  it("continues the turn when the planner fails", async () => {
    const root = await tempRoot();
    const notes: string[] = [];
    const result = await maybeAutoPlan({
      text: "apply to these 5 jobs using my CV",
      goalId: "goal_fail",
      root,
      attempted: new Set(),
      notify: (message) => notes.push(message),
      runtime: {
        async run() {
          return {
            agent: "planner",
            text: "",
            exitCode: 1,
            stderr: "boom",
            aborted: false,
          };
        },
      },
    });
    assert.equal(result.planned, false);
    assert.ok(notes.some((note) => /boom|Continuing without/.test(note)));
  });

  it("injects a plan-digest message from before_agent_start", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    bindSubagent(pi, {
      goalId: "goal_hook",
      root,
      runtime: stubPlan().runtime,
    });
    const results = await pi.emit("before_agent_start", {
      prompt: "apply to these 5 jobs using my CV",
    });
    const injected = results.find(
      (entry) => entry && typeof entry === "object" && "message" in (entry as object),
    ) as { message?: { customType?: string; content?: string; display?: boolean } } | undefined;
    assert.equal(injected?.message?.customType, "plan-digest");
    assert.equal(injected?.message?.display, true);
    assert.match(injected?.message?.content ?? "", /Five jobs/);
  });
});
