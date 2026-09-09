/**
 * Isolated Pi JSON subprocess. Fresh argv: not the parent web server, not the TUI
 * flags that stripped coding tools and loaded the browser extension.
 *
 * Matches Pi's official subagent spawn: `--mode json -p --no-session` and `Task: …`.
 * Persistent `--session-id coder` is a follow-up (ideas/resume-from-scratch.md), not
 * load-bearing here: `--no-session` still wins if both flags are passed.
 * `--no-extensions` is the required exception so the child does not load the browser
 * parent; `-e pi-model-auto` keeps Router floors. A floor is never a positional `@ultra`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentConfig } from "./discover.ts";
import { discoverPackagedAgents, findAgent } from "./discover.ts";

const PI_CLI = path.join("@earendil-works", "pi-coding-agent", "dist", "cli.js");
/** First wall-clock slice before the host asks to extend. */
export const DEFAULT_TIMEOUT_MS = 180_000;
/** How long to wait for the operator before treating extend as no. */
export const CONFIRM_WAIT_MS = 60_000;
/** Hard cap across slices so a runaway child cannot run forever. */
export const MAX_TOTAL_TIMEOUT_MS = 15 * 60_000;
export const MAX_EXTENSIONS = 3;
const FLOORS = new Set(["low", "medium", "high", "ultra"]);

/** The model pi-model-auto registers. `@ultra` is a first-turn prefix, not this id. */
export const ROUTER_MODEL = "pi-router/auto";

export interface ChildInvocation {
  command: string;
  args: string[];
}

export interface WorkerResult {
  agent: string;
  text: string;
  exitCode: number;
  stderr: string;
  aborted: boolean;
  errorMessage?: string;
  stopReason?: string;
  elapsedMs?: number;
  tools?: string[];
  toolPreviews?: string[];
  turns?: number;
  model?: string;
  usage?: WorkerUsage;
}

export interface WorkerUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export type WorkerUpdate = (update: {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}) => void;

export type SpawnImpl = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ["ignore", "pipe", "pipe"] },
) => ChildProcess;

export function packageRootFrom(moduleUrl = import.meta.url): string {
  return path.join(path.dirname(fileURLToPath(moduleUrl)), "..", "..", "..");
}

export function piCliPath(root = packageRootFrom()): string {
  const require = createRequire(import.meta.url);
  try {
    const main = require.resolve("@earendil-works/pi-coding-agent");
    const cli = path.join(path.dirname(main), "cli.js");
    if (existsSync(cli)) return cli;
  } catch {
    /* nested or unpublished layouts fall through to the checkout node_modules path */
  }
  return path.join(root, "node_modules", ...PI_CLI.split(path.sep));
}

/** `@ultra` / `ultra` are Pi Router floors (D12), not `--model` ids. */
export function capabilityFloor(model?: string): string | undefined {
  const raw = model?.trim() ?? "";
  if (!raw) return undefined;
  const name = (raw.startsWith("@") ? raw.slice(1) : raw).toLowerCase();
  return FLOORS.has(name) ? name : undefined;
}

export function loadsModelAuto(paths: readonly string[]): boolean {
  return paths.some((item) => item.replace(/\\/g, "/").includes("pi-model-auto"));
}

/**
 * `--model @ultra` is not a Pi model. With the router loaded, select `pi-router/auto`.
 * Without it, omit `--model` rather than crashing. Concrete `provider/id` still passes through.
 */
export function childModelFlag(agentModel: string | undefined, extraExtensions: readonly string[]): string | undefined {
  const floor = capabilityFloor(agentModel);
  if (floor) return loadsModelAuto(extraExtensions) ? ROUTER_MODEL : undefined;
  const concrete = agentModel?.trim();
  return concrete || undefined;
}

/** Positional user prompt. Never starts with `@` — Pi would treat that as a file include. */
export function childPrompt(task: string): string {
  return `Task: ${task}`;
}

/** Body of a Pi `@file` include so the child's first user message can carry a Router floor. */
export function floorTaskFileBody(task: string, floor: string): string {
  return `@${floor}\n${childPrompt(task)}\n`;
}

/** True when a spawn argv positional is a Router floor stuffed where Pi expects a path. */
export function isFloorPositional(arg: string): boolean {
  return /^@(low|medium|high|ultra)(\s|$)/i.test(arg);
}

/** Map `--model @ultra` in a Pi argv to `pi-router/auto`, or drop the flag. */
export function rewriteArgvModelFlag(args: string[], extraExtensions: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1] !== undefined) {
      const mapped = childModelFlag(args[i + 1], extraExtensions);
      i += 1;
      if (mapped) {
        out.push("--model", mapped);
      }
      continue;
    }
    out.push(args[i]!);
  }
  return out;
}

/** Optional: @ultra / @medium need the router; --no-extensions would otherwise drop it. */
export function modelAutoExtensionPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    try {
      const pkg = require.resolve("pi-model-auto/package.json");
      const dir = path.dirname(pkg);
      for (const rel of ["src/index.ts", "dist/pi/extension.js", "dist/extension.js"]) {
        const file = path.join(dir, rel);
        if (existsSync(file)) return file;
      }
    } catch {
      /* package.json is not in "exports"; the main entry is the extension. */
    }
    const main = require.resolve("pi-model-auto");
    return existsSync(main) ? main : undefined;
  } catch {
    return undefined;
  }
}

export function buildChildInvocation(input: {
  piEntry: string;
  agent: AgentConfig;
  task: string;
  promptFile: string;
  extraExtensions?: string[];
  /** When set, passed as `@/abs/path` (Pi file include). Otherwise `Task: …`. */
  userFile?: string;
}): ChildInvocation {
  const args = [
    input.piEntry,
    "--mode",
    "json",
    "-p",
    "--no-session",
    "--no-extensions",
  ];
  const extra = input.extraExtensions ?? [];
  for (const ext of extra) {
    args.push("-e", ext);
  }
  const model = childModelFlag(input.agent.model, extra);
  if (model) args.push("--model", model);
  if (input.agent.thinking) args.push("--thinking", input.agent.thinking);
  if (input.agent.tools.length > 0) args.push("--tools", input.agent.tools.join(","));
  args.push("--append-system-prompt", input.promptFile);
  if (input.userFile) {
    args.push(`@${input.userFile}`);
  } else {
    args.push(childPrompt(input.task));
  }
  return { command: process.execPath, args };
}

export interface JsonCapture {
  messages: Array<{ role?: string; content?: unknown; errorMessage?: string; stopReason?: string }>;
  errorMessage?: string;
  stopReason?: string;
  tools: string[];
  toolPreviews: string[];
  usage: WorkerUsage;
  model?: string;
}

function emptyUsage(): WorkerUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

function addUsage(usage: WorkerUsage, extra: unknown): void {
  if (!extra || typeof extra !== "object") return;
  const item = extra as Record<string, unknown>;
  const num = (key: string) => (typeof item[key] === "number" ? (item[key] as number) : 0);
  usage.input += num("input");
  usage.output += num("output");
  usage.cacheRead += num("cacheRead");
  usage.cacheWrite += num("cacheWrite");
  const cost = item.cost;
  if (typeof cost === "number") usage.cost += cost;
  else if (cost && typeof cost === "object" && typeof (cost as { total?: number }).total === "number") {
    usage.cost += (cost as { total: number }).total;
  }
  if (typeof item.totalTokens === "number") usage.contextTokens = item.totalTokens;
}

export function formatUsageLine(usage: WorkerUsage, model?: string): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${usage.input}`);
  if (usage.output) parts.push(`↓${usage.output}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (model) parts.push(model);
  return parts.join(" ");
}

export function childProcessEnv(
  goalId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    BSA_SUBAGENT: "1",
    ...(goalId ? { BSA_GOAL_ID: goalId } : {}),
  };
}

function toolPreview(name: string, args?: Record<string, unknown>): string {
  if (name === "bash" && typeof args?.command === "string") {
    const command = args.command.replace(/\s+/g, " ").trim();
    return `$ ${command.length > 60 ? `${command.slice(0, 60)}...` : command}`;
  }
  const file = args && (args.file_path ?? args.path);
  if (typeof file === "string" && file) return `${name} ${file}`;
  if (typeof args?.pattern === "string") return `${name} ${args.pattern}`;
  return name;
}

function textFromMessages(messages: JsonCapture["messages"]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
          const text = (part as { text?: string }).text;
          if (text?.trim()) return text;
        }
      }
    }
    if (msg.errorMessage?.trim()) return msg.errorMessage;
  }
  return "";
}

export function parsePiJsonLine(line: string, capture: JsonCapture | JsonCapture["messages"]): void {
  const sink: JsonCapture = Array.isArray(capture)
    ? { messages: capture, tools: [], toolPreviews: [], usage: emptyUsage() }
    : capture;
  sink.tools ??= [];
  sink.toolPreviews ??= [];
  sink.usage ??= emptyUsage();
  const trimmed = line.trim();
  if (!trimmed) return;
  let event: {
    type?: string;
    toolName?: string;
    tool_name?: string;
    args?: Record<string, unknown>;
    input?: Record<string, unknown>;
    message?: {
      role?: string;
      content?: unknown;
      errorMessage?: string;
      stopReason?: string;
      model?: string;
      usage?: unknown;
    };
    messages?: JsonCapture["messages"];
    errorMessage?: string;
    stopReason?: string;
  };
  try {
    event = JSON.parse(trimmed) as typeof event;
  } catch {
    return;
  }

  if (event.message?.errorMessage) sink.errorMessage = event.message.errorMessage;
  if (event.message?.stopReason) sink.stopReason = event.message.stopReason;
  if (typeof event.errorMessage === "string") sink.errorMessage = event.errorMessage;
  if (typeof event.stopReason === "string") sink.stopReason = event.stopReason;
  if (event.message?.model) sink.model = event.message.model;

  const toolName = event.toolName ?? event.tool_name;
  if (
    (event.type === "tool_execution_start" || event.type === "tool_start" || event.type === "tool_call") &&
    typeof toolName === "string" &&
    toolName.trim()
  ) {
    const name = toolName.trim();
    sink.tools.push(name);
    const args = event.args ?? event.input;
    sink.toolPreviews.push(toolPreview(name, args && typeof args === "object" ? args : undefined));
  }

  if ((event.type === "message_end" || event.type === "tool_result_end") && event.message) {
    sink.messages.push(event.message);
    if (event.message.role === "assistant") {
      sink.usage.turns += 1;
      addUsage(sink.usage, event.message.usage);
    }
    return;
  }
  if (event.type === "agent_end") {
    if (Array.isArray(event.messages)) {
      for (const message of event.messages) sink.messages.push(message);
    } else if (event.message) {
      sink.messages.push(event.message);
    }
  }
}

function waitMs(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface ExtendRequest {
  elapsedMs: number;
  sliceMs: number;
  extensionsUsed: number;
  taskPreview?: string;
  latestTool?: string;
}

export const HEARTBEAT_MS = 5_000;

export interface RunWorkerOptions {
  agentName: string;
  task: string;
  scratchDir: string;
  /** Parent Magpie goal; stamped on the child as BSA_GOAL_ID. */
  goalId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  confirmExtend?: (request: ExtendRequest) => Promise<boolean>;
  confirmWaitMs?: number;
  maxTotalMs?: number;
  maxExtensions?: number;
  spawnImpl?: SpawnImpl;
  piEntry?: string;
  extraExtensions?: string[];
  agents?: AgentConfig[];
  onUpdate?: WorkerUpdate;
  heartbeatMs?: number;
}

export function resolveTimeoutMs(
  requested?: number,
  env = process.env.BSA_SUBAGENT_TIMEOUT_MS,
): number {
  const raw = requested ?? Number(env ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export function formatDurationMs(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const minutes = ms / 60_000;
  return Number.isInteger(minutes) ? `${minutes} min` : `${minutes.toFixed(1)} min`;
}

export async function runWorker(options: RunWorkerOptions): Promise<WorkerResult> {
  const agents = options.agents ?? discoverPackagedAgents();
  const agent = findAgent(options.agentName, agents);
  if (!agent) {
    const available = agents.map((item) => item.name).join(", ") || "none";
    return {
      agent: options.agentName,
      text: "",
      exitCode: 1,
      stderr: `Unknown agent: "${options.agentName}". Available: ${available}.`,
      aborted: false,
    };
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), "bsa-worker-"));
  const promptFile = path.join(tmp, "prompt.md");
  await writeFile(promptFile, agent.systemPrompt, { encoding: "utf8", mode: 0o600 });

  const extra = options.extraExtensions ?? [modelAutoExtensionPath()].filter(
    (item): item is string => Boolean(item),
  );
  const floor = capabilityFloor(agent.model);
  let userFile: string | undefined;
  if (floor && loadsModelAuto(extra)) {
    userFile = path.join(tmp, "task.txt");
    await writeFile(userFile, floorTaskFileBody(options.task, floor), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  const invocation = buildChildInvocation({
    piEntry: options.piEntry ?? piCliPath(),
    agent,
    task: options.task,
    promptFile,
    extraExtensions: extra,
    userFile,
  });

  const spawnImpl = options.spawnImpl ?? (spawn as SpawnImpl);
  const capture: JsonCapture = { messages: [], tools: [], toolPreviews: [], usage: emptyUsage() };
  let stderr = "";
  let aborted = false;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const confirmWaitMs = options.confirmWaitMs ?? CONFIRM_WAIT_MS;
  const maxTotalMs = options.maxTotalMs ?? MAX_TOTAL_TIMEOUT_MS;
  const maxExtensions = options.maxExtensions ?? MAX_EXTENSIONS;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const started = Date.now();

  const snapshotDetails = (running: boolean, extra?: Record<string, unknown>) => {
    const elapsedMs = Date.now() - started;
    const latestTool = capture.toolPreviews.at(-1) ?? capture.tools.at(-1);
    const output = textFromMessages(capture.messages);
    return {
      agent: agent.name,
      task: options.task,
      running,
      elapsedMs,
      timeoutMs,
      tools: capture.toolPreviews.length > 0 ? capture.toolPreviews : capture.tools,
      latestTool,
      turns: capture.usage.turns,
      model: capture.model,
      usage: formatUsageLine(capture.usage, capture.model) || undefined,
      output: output || undefined,
      errorMessage: capture.errorMessage,
      ...extra,
    };
  };

  const emitUpdate = (running = true, extra?: Record<string, unknown>) => {
    if (!options.onUpdate) return;
    const details = snapshotDetails(running, extra);
    const text = extra?.waiting
      ? "(waiting to extend…)"
      : details.output
        || capture.errorMessage
        || (details.latestTool
          ? `${details.latestTool} · ${formatDurationMs(details.elapsedMs)}`
          : "(running…)");
    options.onUpdate({
      content: [{ type: "text", text: String(text) }],
      details,
    });
  };

  try {
    emitUpdate();
    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawnImpl(invocation.command, invocation.args, {
        cwd: options.scratchDir,
        env: childProcessEnv(options.goalId),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let buffer = "";
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const clock = new AbortController();
      const onAbort = () => {
        killProc();
      };
      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        if (!clock.signal.aborted) clock.abort();
        options.signal?.removeEventListener("abort", onAbort);
        if (buffer.trim()) parsePiJsonLine(buffer, capture);
        resolve(code);
      };

      proc.stdout?.on("data", (chunk: Buffer | string) => {
        buffer += String(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          parsePiJsonLine(line, capture);
          emitUpdate();
        }
      });
      proc.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      proc.on("close", (code) => finish(code ?? 0));
      proc.on("error", () => finish(1));

      function killProc() {
        aborted = true;
        if (killTimer) clearTimeout(killTimer);
        killTimer = setTimeout(() => {
          if (!settled) proc.kill("SIGKILL");
        }, 5_000);
        proc.kill("SIGTERM");
      }

      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener("abort", onAbort, { once: true });

      void (async () => {
        let sliceMs = timeoutMs;
        let extensions = 0;
        let sliceDeadline = started + sliceMs;
        while (!settled) {
          const now = Date.now();
          if (now < sliceDeadline) {
            await waitMs(Math.min(heartbeatMs, sliceDeadline - now), clock.signal);
            if (settled) return;
            emitUpdate();
            continue;
          }
          const elapsed = Date.now() - started;
          const budget = maxTotalMs - elapsed;
          const canAsk =
            Boolean(options.confirmExtend) && extensions < maxExtensions && budget > 0;
          if (!canAsk) {
            killProc();
            return;
          }
          emitUpdate(true, { waiting: true });
          const confirmClock = new AbortController();
          const stopConfirm = () => {
            if (!confirmClock.signal.aborted) confirmClock.abort();
          };
          clock.signal.addEventListener("abort", stopConfirm, { once: true });
          let ok = false;
          const asked = options.confirmExtend!({
            elapsedMs: elapsed,
            sliceMs,
            extensionsUsed: extensions,
            taskPreview: options.task.replace(/\s+/g, " ").trim().slice(0, 80),
            latestTool: capture.toolPreviews.at(-1) ?? capture.tools.at(-1),
          }).then((value) => {
            ok = Boolean(value);
          });
          await Promise.race([asked, waitMs(confirmWaitMs, confirmClock.signal)]);
          stopConfirm();
          if (settled) return;
          if (!ok) {
            killProc();
            return;
          }
          extensions += 1;
          sliceMs = Math.min(timeoutMs, Math.max(1, budget));
          sliceDeadline = Date.now() + sliceMs;
        }
      })();
    });

    const text =
      textFromMessages(capture.messages) || capture.errorMessage?.trim() || stderr.trim();
    return {
      agent: agent.name,
      text,
      exitCode,
      stderr,
      aborted,
      errorMessage: capture.errorMessage,
      stopReason: capture.stopReason,
      elapsedMs: Date.now() - started,
      tools: capture.tools,
      toolPreviews: capture.toolPreviews,
      turns: capture.usage.turns,
      model: capture.model,
      usage: capture.usage,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
