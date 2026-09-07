import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
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
  PLAN_COMMAND,
  SCRATCH_LS_TOOL_NAME,
  SCRATCH_READ_TOOL_NAME,
  standingPlanPrompt,
  standingScratchPrompt,
  SUBAGENT_TOOL_NAME,
  withScratchResume,
} from "../../src/host/pi-subagent/bind.ts";
import { discoverPackagedAgents, findAgent } from "../../src/host/pi-subagent/discover.ts";
import {
  buildChildInvocation,
  childModelFlag,
  childPrompt,
  floorTaskFileBody,
  modelAutoExtensionPath,
  parsePiJsonLine,
  piCliPath,
  rewriteArgvModelFlag,
  ROUTER_MODEL,
  runWorker,
  type SpawnImpl,
} from "../../src/host/pi-subagent/spawn.ts";
import { piEntryPath } from "../../src/hosts/local-cli/launch.ts";
import { bindPlanMode, PARENT_NEVER_TOOLS, planModeTools, sessionTurnCount } from "../../src/host/pi-plan-mode.ts";
import { extensionContext } from "../../src/host/memory-host.ts";
import { NodeHub } from "../../src/hosts/web/hub.ts";
import { OperatorRuntime } from "../../src/hosts/web/runtime.ts";
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

function hangingChild(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  Object.assign(proc, {
    stdout,
    stderr,
    killed: false,
    kill() {
      (proc as ChildProcess & { killed: boolean }).killed = true;
      queueMicrotask(() => proc.emit("close", 143));
      return true;
    },
  });
  return proc;
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
    assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], ROUTER_MODEL);
    assert.equal(invocation.args.includes("@ultra"), false);
    assert.ok(invocation.args.includes("Task: apply to three jobs"));
    assert.equal(
      invocation.args.some((arg) => /^@(low|medium|high|ultra)(\s|$)/i.test(arg)),
      false,
      "a positional @ultra is a file include, not a Router floor",
    );
  });

  it("does not pass @ultra as --model", () => {
    assert.equal(childModelFlag("@ultra", ["/opt/pi-model-auto/src/index.ts"]), ROUTER_MODEL);
    assert.equal(childModelFlag("@medium", []), undefined);
    assert.equal(childModelFlag("anthropic/claude-opus-4-8", []), "anthropic/claude-opus-4-8");
    assert.equal(childPrompt("three jobs"), "Task: three jobs");
  });

  it("resolves pi-model-auto even when package.json is not exported", () => {
    const file = modelAutoExtensionPath();
    assert.ok(file);
    assert.match(file.replace(/\\/g, "/"), /pi-model-auto/);
  });

  it("rewrites argv --model floors and leaves concrete ids", () => {
    const router = ["/opt/pi-model-auto/src/index.ts"];
    assert.deepEqual(rewriteArgvModelFlag(["--model", "@ultra", "-p"], router), [
      "--model",
      ROUTER_MODEL,
      "-p",
    ]);
    assert.deepEqual(rewriteArgvModelFlag(["--model", "@ultra"], []), []);
    assert.deepEqual(rewriteArgvModelFlag(["--model", "openrouter/foo"], []), [
      "--model",
      "openrouter/foo",
    ]);
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
    assert.equal(calls[0]?.args.includes("--model"), false);
    assert.ok(calls[0]?.args.includes("Task: three jobs"));
    assert.equal(calls[0]?.args.includes("@ultra"), false);
  });

  it("passes a Router floor as a @file include, never as a positional @ultra Task", async () => {
    const root = await tempRoot();
    const scratchDir = await ensureScratch("goal_floor", root);
    const calls: Array<{ args: string[]; body?: string }> = [];
    const spawnImpl: SpawnImpl = (_command, args) => {
      const include = args.find((arg) => arg.startsWith("@") && !arg.startsWith("--"));
      let body: string | undefined;
      if (include) {
        body = readFileSync(include.slice(1), "utf8");
      }
      calls.push({ args, body });
      return fakeChild([
        JSON.stringify({
          type: "agent_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
          },
        }),
      ]);
    };

    const result = await runWorker({
      agentName: "coder",
      task: "unzip the download",
      scratchDir,
      spawnImpl,
      piEntry: "/fake/cli.js",
      extraExtensions: ["/opt/pi-model-auto/src/index.ts"],
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.text, /done/);
    const include = calls[0]?.args.find((arg) => arg.startsWith("@") && !arg.startsWith("--"));
    assert.ok(include?.startsWith("@"));
    assert.equal(/^@(low|medium|high|ultra)(\s|$)/i.test(include ?? ""), false);
    assert.equal(include?.includes("Task:"), false);
    assert.equal(calls[0]?.args[calls[0].args.indexOf("--model") + 1], ROUTER_MODEL);
    assert.match(calls[0]?.body ?? "", /^@medium\nTask: unzip the download/);
    assert.equal(floorTaskFileBody("unzip the download", "medium"), calls[0]?.body);
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

  it("streams onUpdate and falls back when the turn is thinking-only", async () => {
    const root = await tempRoot();
    const scratchDir = await ensureScratch("goal_update", root);
    const updates: string[] = [];
    const spawnImpl: SpawnImpl = () =>
      fakeChild([
        JSON.stringify({ type: "tool_execution_start", toolName: "bash" }),
        JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "thinking", thinking: "..." }],
            stopReason: "end_turn",
          },
        }),
      ]);

    const result = await runWorker({
      agentName: "coder",
      task: "list files",
      scratchDir,
      spawnImpl,
      piEntry: "/fake/cli.js",
      extraExtensions: [],
      onUpdate: (update) => {
        updates.push(update.content.map((part) => part.text).join(""));
      },
    });
    assert.match(updates[0] ?? "", /running/);
    assert.equal(updates.some((text) => text.includes("bash")), true);
    assert.equal(result.text.trim(), "");
    assert.equal(result.stopReason, "end_turn");
  });

  it("kills a hung child after the slice when nobody can confirm", async () => {
    const scratchDir = await tempRoot();
    const result = await runWorker({
      agentName: "coder",
      task: "hang",
      scratchDir,
      timeoutMs: 40,
      confirmWaitMs: 10,
      spawnImpl: () => hangingChild(),
      piEntry: "/fake/cli.js",
      extraExtensions: [],
    });
    assert.equal(result.aborted, true);
    assert.equal(result.exitCode, 143);
  });

  it("extends once when the host confirms, then kills at the cap", async () => {
    const scratchDir = await tempRoot();
    const asks: number[] = [];
    const result = await runWorker({
      agentName: "coder",
      task: "hang",
      scratchDir,
      timeoutMs: 40,
      confirmWaitMs: 200,
      maxTotalMs: 10_000,
      maxExtensions: 1,
      confirmExtend: async () => {
        asks.push(Date.now());
        return true;
      },
      spawnImpl: () => hangingChild(),
      piEntry: "/fake/cli.js",
      extraExtensions: [],
    });
    assert.equal(asks.length, 1);
    assert.equal(result.aborted, true);
  });

  it("does not kill if the child exits while waiting to extend", async () => {
    const scratchDir = await tempRoot();
    let spawned: ((child: ChildProcess) => void) | undefined;
    const ready = new Promise<ChildProcess>((resolve) => {
      spawned = resolve;
    });
    const resultPromise = runWorker({
      agentName: "coder",
      task: "hang",
      scratchDir,
      timeoutMs: 30,
      confirmWaitMs: 5_000,
      confirmExtend: () => new Promise(() => {
        /* never answers */
      }),
      spawnImpl: () => {
        const proc = hangingChild();
        spawned?.(proc);
        return proc;
      },
      piEntry: "/fake/cli.js",
      extraExtensions: [],
    });
    const child = await ready;
    await new Promise((resolve) => setTimeout(resolve, 50));
    child.emit("close", 0);
    const result = await resultPromise;
    assert.equal(result.aborted, false);
    assert.equal(result.exitCode, 0);
  });
});

describe("subagent bind", () => {
  it("registers subagent and scratch_write, keeps bash off the parent", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    assert.equal(pi.tools.has(SUBAGENT_TOOL_NAME), true);
    assert.equal(pi.tools.has("scratch_write"), true);
    assert.equal(pi.tools.has(SCRATCH_LS_TOOL_NAME), true);
    assert.equal(pi.tools.has(SCRATCH_READ_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes(SUBAGENT_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes("bash"), false);
    assert.match(CHAT_WORKER_HINT, /coder/);
    assert.doesNotMatch(CHAT_WORKER_HINT, /Opus/);
    assert.match(CHAT_WORKER_HINT, /\/plan toggles/);
    assert.match(CHAT_WORKER_HINT, /do not rebuild/);
    assert.doesNotMatch(CHAT_WORKER_HINT, /you still have no shell/i);
  });

  it("writes into scratch and refuses paths that escape it", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    bindSubagent(pi, { goalId: "goal_scratch", root });
    const written = await runTool(pi, "scratch_write", {
      name: "notes.md",
      content: "hello",
    });
    assert.equal(written.isError, false);
    const file = path.join(root, "goals", "goal_scratch", "scratch", "notes.md");
    assert.equal(await readFile(file, "utf8"), "hello");

    const escaped = await runTool(pi, "scratch_write", {
      name: "../events.jsonl",
      content: "nope",
    });
    assert.equal(escaped.isError, true);
  });

  it("lists and reads scratch, and refuses a path that escapes it", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    bindSubagent(pi, { goalId: "goal_read", root });
    await runTool(pi, "scratch_write", { name: "notes.md", content: "hello from scratch" });
    const listed = await runTool(pi, SCRATCH_LS_TOOL_NAME, {});
    assert.equal(listed.isError, false);
    assert.match(listed.content[0]?.text ?? "", /notes.md/);
    const read = await runTool(pi, SCRATCH_READ_TOOL_NAME, { name: "notes.md" });
    assert.equal(read.isError, false);
    assert.match(read.content[0]?.text ?? "", /hello from scratch/);
    const escaped = await runTool(pi, SCRATCH_READ_TOOL_NAME, { name: "../events.jsonl" });
    assert.equal(escaped.isError, true);
    const scratchDir = path.join(root, "goals", "goal_read", "scratch");
    await writeFile(path.join(scratchDir, "blob.bin"), Buffer.from([0, 1, 2, 3]));
    const binary = await runTool(pi, SCRATCH_READ_TOOL_NAME, { name: "blob.bin" });
    assert.equal(binary.isError, true);
    assert.match(binary.content[0]?.text ?? "", /binary/);
    await writeFile(path.join(scratchDir, "long.md"), "z".repeat(DIGEST_MAX_CHARS + 80));
    const truncated = await runTool(pi, SCRATCH_READ_TOOL_NAME, { name: "long.md" });
    assert.equal(truncated.isError, false);
    assert.match(truncated.content[0]?.text ?? "", /offset=\d+ to continue/);
    const continued = await runTool(pi, SCRATCH_READ_TOOL_NAME, {
      name: "long.md",
      offset: DIGEST_MAX_CHARS,
    });
    assert.equal(continued.isError, false);
    assert.doesNotMatch(continued.content[0]?.text ?? "", /offset=\d+ to continue/);
    assert.match(continued.content[0]?.text ?? "", /z{10,}/);
  });

  it("marks abort and provider errors as isError and includes a scratch inventory", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    bindSubagent(pi, {
      goalId: "goal_err",
      root,
      runtime: {
        async run() {
          return {
            agent: "coder",
            text: "",
            exitCode: 143,
            stderr: "",
            aborted: true,
            errorMessage: "Codex error: The usage limit has been reached",
            stopReason: "error",
          };
        },
      },
    });
    await runTool(pi, "scratch_write", { name: "partial.json", content: "[]" });
    const result = await runTool(pi, SUBAGENT_TOOL_NAME, { agent: "coder", task: "status" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]?.text ?? "", /aborted/);
    assert.match(result.content[0]?.text ?? "", /partial.json/);
    assert.match(result.content[0]?.text ?? "", /Do not repeat the same harvest/);
  });

  it("records parent-only tools on the payload log", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    const payloads: Array<{ tool: string; text: string }> = [];
    bindSubagent(pi, {
      goalId: "goal_log",
      root,
      runtime: {
        async run() {
          return { agent: "coder", text: "ok", exitCode: 0, stderr: "", aborted: false };
        },
      },
      evidence: {
        payloads: {
          write(record) {
            payloads.push({ tool: record.tool, text: record.text });
          },
          async flush() {},
        },
        metrics: { record() {}, async flush() {} },
      },
    });
    await runTool(pi, "scratch_write", { name: "a.md", content: "x" });
    await runTool(pi, SCRATCH_LS_TOOL_NAME, {});
    await runTool(pi, SCRATCH_READ_TOOL_NAME, { name: "a.md" });
    await runTool(pi, SUBAGENT_TOOL_NAME, { agent: "coder", task: "status" });
    assert.equal(payloads.some((row) => row.tool === "scratch_write"), true);
    assert.equal(payloads.some((row) => row.tool === SCRATCH_LS_TOOL_NAME), true);
    assert.equal(payloads.some((row) => row.tool === SCRATCH_READ_TOOL_NAME), true);
    assert.equal(payloads.some((row) => row.tool === SUBAGENT_TOOL_NAME), true);
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

  it("exposes /plan on the hosted chat command bar as a toggle", async () => {
    const source = await readFile(path.join(ROOT, "src/hosts/web/public/app.js"), "utf8");
    assert.match(source, /\["plan", "Toggle plan mode"\]/);
  });

  it("injects scratch/plan.md into the operate prompt when a file already exists", async () => {
    const root = await tempRoot();
    const scratchDir = await ensureScratch("goal_standing", root);
    await writeFile(
      path.join(scratchDir, "plan.md"),
      "## Goal\nFind ten people.\n\n## Digest\nInstagram first.\n",
    );
    const snippet = await standingPlanPrompt("goal_standing", root);
    assert.match(snippet, /scratch\/plan.md already exists/);
    assert.match(snippet, /Instagram first/);
  });

  it("injects a standing scratch inventory so the parent resumes instead of rebuilding", async () => {
    const root = await tempRoot();
    const scratchDir = await ensureScratch("goal_resume", root);
    await writeFile(path.join(scratchDir, "candidates.json"), "[]\n");
    const snippet = await standingScratchPrompt("goal_resume", root);
    assert.match(snippet, /do not rebuild/i);
    assert.match(snippet, /candidates.json/);
  });

  it("tells the child about files already in scratch", () => {
    const wrapped = withScratchResume("harvest again", [
      { name: "candidates.json", bytes: 21, mtime: "2026-09-07T00:00:00.000Z" },
    ]);
    assert.match(wrapped, /do not rebuild/i);
    assert.match(wrapped, /candidates.json/);
    assert.match(wrapped, /harvest again/);
  });

  it("passes existing scratch into the child task on spawn", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    let seen = "";
    bindSubagent(pi, {
      goalId: "goal_spawn_resume",
      root,
      runtime: {
        async run(input) {
          seen = input.task;
          return { agent: "coder", text: "ok", exitCode: 0, stderr: "", aborted: false };
        },
      },
    });
    await runTool(pi, "scratch_write", { name: "partial.json", content: "[]" });
    const result = await runTool(pi, SUBAGENT_TOOL_NAME, { agent: "coder", task: "finish the harvest" });
    assert.equal(result.isError, false);
    assert.match(seen, /partial.json/);
    assert.match(seen, /do not rebuild/i);
    assert.match(seen, /finish the harvest/);
  });

  it("ask_user blocks on Pi input instead of returning nobody available", async () => {
    const pi = createFakePi(["Instagram, about 20"]);
    browserSessionAgent(pi);
    await pi.startSession();
    const result = await runTool(pi, "ask_user", { question: "Which platform?" });
    const text = result.content.map((part) => ("text" in part ? part.text : "")).join("");
    assert.match(text, /"answered":true/);
    assert.match(text, /Instagram, about 20/);
    assert.doesNotMatch(text, /Nobody available/);
  });

  it("ask_user says the operator dismissed, not that nobody is available", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    const result = await runTool(pi, "ask_user", { question: "Which platform?" });
    const text = result.content.map((part) => ("text" in part ? part.text : "")).join("");
    assert.match(text, /Do not invent an answer/);
    assert.doesNotMatch(text, /Nobody available/);
  });
});

describe("in-session plan mode", () => {
  it("/plan with no args toggles act off without a usage warning", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    assert.equal(pi.getActiveTools().includes("act"), true);
    await runCommand(pi, PLAN_COMMAND, "  ");
    assert.doesNotMatch(pi.notifications.join("\n"), /Usage: \/plan/);
    assert.match(pi.notifications.at(-1) ?? "", /Plan mode on/);
    assert.equal(pi.getActiveTools().includes("act"), false);
    assert.equal(pi.getActiveTools().includes("observe"), true);
    assert.equal(pi.getActiveTools().includes("scratch_write"), false);
    assert.equal(pi.getActiveTools().includes(SCRATCH_LS_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes("bash"), false);
    assert.equal(pi.getActiveTools().includes("write"), false);
    assert.equal(pi.getActiveTools().includes("edit"), false);
    assert.equal(pi.statuses.get("plan-mode"), "⏸ plan");
    await runCommand(pi, PLAN_COMMAND, "");
    assert.equal(pi.getActiveTools().includes("act"), true);
    assert.equal(pi.getActiveTools().includes("write"), false);
  });

  it("Execute restores act after a numbered plan", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await runCommand(pi, PLAN_COMMAND, "");
    assert.equal(pi.getActiveTools().includes("act"), false);
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Plan:\n1. Open the jobs page first\n2. Collect every listing next\n",
            },
          ],
        },
      ],
    });
    assert.equal(pi.getActiveTools().includes("act"), true);
    assert.ok(
      pi.customMessages.some((message) => message.content.includes("Execute the plan")) ||
        pi.userMessages.some((text) => text.includes("Execute the plan")),
    );
  });

  it("does not trigger a turn when the session moved during the Execute prompt", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await runCommand(pi, PLAN_COMMAND, "");
    const extra: Array<{ type: string; message: unknown }> = [];
    const inner = pi.ctx.sessionManager!;
    const original = inner.getEntries.bind(inner);
    inner.getEntries = () => [
      ...original(),
      ...extra,
    ];
    pi.ctx.ui.select = async () => {
      extra.push({ type: "message", message: { role: "user", content: "What are you doing?" } });
      return "Execute the plan (track progress)";
    };
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Plan:\n1. Open the page first\n2. Collect listings next\n" }],
        },
      ],
    });
    assert.equal(pi.userMessages.some((text) => text.includes("Execute the plan")), false);
    assert.ok(pi.customMessages.some((message) => message.content.includes("Execute the plan")));
    assert.equal(sessionTurnCount([{ type: "message", message: { role: "user" } }]), 1);
  });

  it("/plan with text enables plan mode and sends the task", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await runCommand(pi, PLAN_COMMAND, "download public photos");
    assert.equal(pi.getActiveTools().includes("act"), false);
    assert.equal(pi.userMessages.includes("download public photos"), true);
  });

  it("never enables bash/write even if they were on the parent tool list", async () => {
    const pi = createFakePi();
    await pi.startSession();
    pi.setActiveTools(["observe", "act", "bash", "write", "ask_user"]);
    bindPlanMode(pi);
    await runCommand(pi, PLAN_COMMAND, "");
    assert.equal(pi.getActiveTools().includes("bash"), false);
    assert.equal(pi.getActiveTools().includes("write"), false);
    assert.equal(pi.getActiveTools().includes("act"), false);
    assert.equal(pi.getActiveTools().includes("observe"), true);
    for (const name of PARENT_NEVER_TOOLS) {
      assert.equal(planModeTools(["observe", "act", ...PARENT_NEVER_TOOLS]).includes(name), false);
    }
  });

  it("restores plan-mode tool gating after session_start", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await runCommand(pi, PLAN_COMMAND, "");
    assert.equal(pi.getActiveTools().includes("act"), false);
    await pi.startSession();
    assert.equal(pi.getActiveTools().includes("act"), false);
    assert.equal(pi.getActiveTools().includes("bash"), false);
    assert.equal(pi.statuses.get("plan-mode"), "⏸ plan");
  });

  it("hosted /plan toggles the real session tools, not a planner spawn", async () => {
    const notes: string[] = [];
    const runtime = new OperatorRuntime(new NodeHub(), (message) => {
      if (message.type === "notify") notes.push(message.message);
    });
    runtime.host.setActiveTools(["observe", "act", "probe", "ask_user", "bash", "write"]);
    await runtime.api.commands.get(PLAN_COMMAND)?.handler("", extensionContext(runtime.host));
    assert.doesNotMatch(notes.join("\n"), /Usage: \/plan/);
    assert.match(notes.join("\n"), /Plan mode on/);
    assert.equal(runtime.host.getActiveTools().includes("act"), false);
    assert.equal(runtime.host.getActiveTools().includes("bash"), false);
    assert.equal(runtime.host.getActiveTools().includes("write"), false);
    assert.equal(runtime.host.getActiveTools().includes("observe"), true);
  });
});
