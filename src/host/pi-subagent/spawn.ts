/**
 * Isolated Pi JSON subprocess. Fresh argv: not the parent web server, not the TUI
 * flags that stripped coding tools and loaded the browser extension.
 *
 * Matches Pi's official subagent spawn: `--mode json -p --no-session` and `Task: …`.
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
}

export type WorkerUpdate = (update: {
  content: Array<{ type: "text"; text: string }>;
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
    ? { messages: capture, tools: [] }
    : capture;
  sink.tools ??= [];
  const trimmed = line.trim();
  if (!trimmed) return;
  let event: {
    type?: string;
    toolName?: string;
    tool_name?: string;
    message?: { role?: string; content?: unknown; errorMessage?: string; stopReason?: string };
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

  const toolName = event.toolName ?? event.tool_name;
  if (
    (event.type === "tool_execution_start" || event.type === "tool_start" || event.type === "tool_call") &&
    typeof toolName === "string" &&
    toolName.trim()
  ) {
    sink.tools.push(toolName.trim());
  }

  if ((event.type === "message_end" || event.type === "tool_result_end") && event.message) {
    sink.messages.push(event.message);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ExtendRequest {
  elapsedMs: number;
  sliceMs: number;
  extensionsUsed: number;
}

export interface RunWorkerOptions {
  agentName: string;
  task: string;
  scratchDir: string;
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
  const capture: JsonCapture = { messages: [], tools: [] };
  let stderr = "";
  let aborted = false;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const confirmWaitMs = options.confirmWaitMs ?? CONFIRM_WAIT_MS;
  const maxTotalMs = options.maxTotalMs ?? MAX_TOTAL_TIMEOUT_MS;
  const maxExtensions = options.maxExtensions ?? MAX_EXTENSIONS;

  const emitUpdate = () => {
    if (!options.onUpdate) return;
    const text = textFromMessages(capture.messages) || capture.errorMessage || "(running…)";
    const tools = capture.tools.length > 0 ? `\n${capture.tools.slice(-12).join("\n")}` : "";
    options.onUpdate({ content: [{ type: "text", text: `${text}${tools}` }] });
  };

  try {
    options.onUpdate?.({ content: [{ type: "text", text: "(running…)" }] });
    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawnImpl(invocation.command, invocation.args, {
        cwd: options.scratchDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let buffer = "";
      let settled = false;
      const finish = (code: number) => {
        if (settled) return;
        settled = true;
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

      const killProc = () => {
        aborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5_000);
      };

      const closed = new Promise<number>((done) => {
        proc.on("close", (code) => done(code ?? 0));
        proc.on("error", () => done(1));
      });
      const abortWait = new Promise<"abort">((done) => {
        if (options.signal?.aborted) done("abort");
        else options.signal?.addEventListener("abort", () => done("abort"), { once: true });
      });
      const onAbort = () => {
        killProc();
      };
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener("abort", onAbort, { once: true });

      void (async () => {
        let sliceMs = timeoutMs;
        let extensions = 0;
        const started = Date.now();
        while (!settled) {
          const winner = await Promise.race([
            closed.then((code) => ({ kind: "exit" as const, code })),
            abortWait.then(() => ({ kind: "abort" as const })),
            sleep(sliceMs).then(() => ({ kind: "timeout" as const })),
          ]);
          if (winner.kind === "exit") {
            options.signal?.removeEventListener("abort", onAbort);
            finish(winner.code);
            return;
          }
          if (winner.kind === "abort") {
            killProc();
            finish(await closed);
            return;
          }
          const elapsed = Date.now() - started;
          const budget = maxTotalMs - elapsed;
          const canAsk =
            Boolean(options.confirmExtend) && extensions < maxExtensions && budget > 0;
          if (!canAsk) {
            killProc();
            finish(await closed);
            return;
          }
          options.onUpdate?.({ content: [{ type: "text", text: "(waiting to extend…)" }] });
          const confirmWinner = await Promise.race([
            closed.then((code) => ({ kind: "exit" as const, code })),
            abortWait.then(() => ({ kind: "abort" as const })),
            options.confirmExtend!({
              elapsedMs: elapsed,
              sliceMs,
              extensionsUsed: extensions,
            }).then((ok) => ({ kind: "confirm" as const, ok: Boolean(ok) })),
            sleep(confirmWaitMs).then(() => ({ kind: "confirm" as const, ok: false })),
          ]);
          if (confirmWinner.kind === "exit") {
            options.signal?.removeEventListener("abort", onAbort);
            finish(confirmWinner.code);
            return;
          }
          if (confirmWinner.kind !== "confirm" || !confirmWinner.ok) {
            killProc();
            finish(await closed);
            return;
          }
          extensions += 1;
          sliceMs = Math.min(timeoutMs, Math.max(1, budget));
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
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
