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
  PLAN_COMMAND,
  PLANNER_AGENT_NAME,
  standingPlanPrompt,
  SUBAGENT_TOOL_NAME,
} from "../../src/host/pi-subagent/bind.ts";
import { discoverPackagedAgents, findAgent } from "../../src/host/pi-subagent/discover.ts";
import {
  buildChildInvocation,
  childModelFlag,
  childPrompt,
  modelAutoExtensionPath,
  parsePiJsonLine,
  piCliPath,
  rewriteArgvModelFlag,
  ROUTER_MODEL,
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
    assert.equal(planner.model, "anthropic/claude-opus-5");

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
    assert.ok(invocation.args.includes("@ultra Task: apply to three jobs"));
  });

  it("does not pass @ultra as --model", () => {
    assert.equal(childModelFlag("@ultra", ["/opt/pi-model-auto/src/index.ts"]), ROUTER_MODEL);
    assert.equal(childModelFlag("@medium", []), undefined);
    assert.equal(childModelFlag(findAgent("planner")!.model, []), "anthropic/claude-opus-5");
    assert.equal(
      childPrompt("three jobs", "@ultra", ["/opt/pi-model-auto/src/index.ts"]),
      "@ultra Task: three jobs",
    );
    assert.equal(childPrompt("three jobs", "@ultra", []), "Task: three jobs");
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
    assert.equal(calls[0]?.args[calls[0]!.args.indexOf("--model") + 1], "anthropic/claude-opus-5");
    assert.ok(calls[0]?.args.includes("Task: three jobs"));
    assert.equal(calls[0]?.args.includes("@ultra"), false);
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
    const confirms: string[] = [];
    host.listeners.onNotify = (message) => notes.push(message);
    host.listeners.onUiRequest = (request) => {
      if (request.kind === "confirm") {
        confirms.push(request.title);
        host.answer(request.requestId, true);
      }
    };

    bindSubagent(api, {
      goalId: "goal_plan",
      root,
      runtime: {
        async run(input) {
          assert.equal(input.agentName, PLANNER_AGENT_NAME);
          assert.ok(input.scratchDir.endsWith(`${path.sep}scratch`));
          return {
            agent: PLANNER_AGENT_NAME,
            text: "## Goal\nApply to three roles.\n\n## Digest\nThree roles, one CV.",
            exitCode: 0,
            stderr: "",
            aborted: false,
          };
        },
      },
    });

    assert.equal(api.tools.has(SUBAGENT_TOOL_NAME), true);
    assert.equal(api.commands.has(PLAN_COMMAND), true);

    await api.commands.get(PLAN_COMMAND)!.handler(
      "apply to three roles",
      extensionContext(host),
    );
    const planFile = path.join(root, "goals", "goal_plan", "scratch", "plan.md");
    const body = await readFile(planFile, "utf8");
    assert.match(body, /Apply to three roles/);
    assert.match(notes[0] ?? "", /Starting planner worker \(anthropic\/claude-opus-5\)/);
    assert.match(notes.at(-1) ?? "", /Planner \(anthropic\/claude-opus-5\) wrote /);
    assert.match(confirms.at(-1) ?? "", /Planner \(anthropic\/claude-opus-5\) finished/);

    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    assert.equal(pi.tools.has(SUBAGENT_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes(SUBAGENT_TOOL_NAME), true);
    assert.equal(pi.getActiveTools().includes("bash"), false);
    assert.match(CHAT_WORKER_HINT, /no shell/);
    assert.match(CHAT_WORKER_HINT, /Opus/);
  });

  it("names the planner when it fails, without writing a plan", async () => {
    const root = await tempRoot();
    const host = new MemoryOperatorHost();
    const api = createExtensionApi(host);
    const notes: string[] = [];
    host.listeners.onNotify = (message) => notes.push(message);
    bindSubagent(api, {
      goalId: "goal_fail",
      root,
      runtime: {
        async run() {
          return {
            agent: PLANNER_AGENT_NAME,
            text: "",
            exitCode: 1,
            stderr: "Model not found",
            aborted: false,
          };
        },
      },
    });
    await api.commands.get(PLAN_COMMAND)!.handler("x", extensionContext(host));
    assert.match(notes.at(-1) ?? "", /Planner \(anthropic\/claude-opus-5\) did not write a plan/);
    assert.match(notes.at(-1) ?? "", /operate agent was not switched/);
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
    assert.match(source, /\["plan", "Plan with Opus"\]/);
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

  it("injects scratch/plan.md into the operate prompt", async () => {
    const root = await tempRoot();
    const scratchDir = await ensureScratch("goal_standing", root);
    await writeFile(
      path.join(scratchDir, "plan.md"),
      "## Goal\nFind ten people.\n\n## Digest\nInstagram first.\n",
    );
    const snippet = await standingPlanPrompt("goal_standing", root);
    assert.match(snippet, /planner worker \(anthropic\/claude-opus-5\)/);
    assert.match(snippet, /You are the operate agent/);
    assert.match(snippet, /Instagram first/);
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
});
