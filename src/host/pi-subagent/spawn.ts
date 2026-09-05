/**
 * Isolated Pi JSON subprocess. Fresh argv: not the parent web server, not the TUI
 * flags that stripped coding tools and loaded the browser extension.
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
const DEFAULT_TIMEOUT_MS = 180_000;

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
}

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

/** Optional: @ultra / @medium need the router; --no-extensions would otherwise drop it. */
export function modelAutoExtensionPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("pi-model-auto/package.json");
    const dir = path.dirname(pkg);
    for (const rel of ["src/index.ts", "dist/pi/extension.js", "dist/extension.js"]) {
      const file = path.join(dir, rel);
      if (existsSync(file)) return file;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function buildChildInvocation(input: {
  piEntry: string;
  agent: AgentConfig;
  task: string;
  promptFile: string;
  extraExtensions?: string[];
}): ChildInvocation {
  const args = [
    input.piEntry,
    "--mode",
    "json",
    "-p",
    "--no-session",
    "--no-extensions",
  ];
  for (const ext of input.extraExtensions ?? []) {
    args.push("-e", ext);
  }
  if (input.agent.model) args.push("--model", input.agent.model);
  if (input.agent.thinking) args.push("--thinking", input.agent.thinking);
  if (input.agent.tools.length > 0) args.push("--tools", input.agent.tools.join(","));
  args.push("--append-system-prompt", input.promptFile);
  args.push(`Task: ${input.task}`);
  return { command: process.execPath, args };
}

function textFromMessages(messages: Array<{ role?: string; content?: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string" && content.trim()) return content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
        const text = (part as { text?: string }).text;
        if (text?.trim()) return text;
      }
    }
  }
  return "";
}

export function parsePiJsonLine(line: string, messages: Array<{ role?: string; content?: unknown }>): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  let event: { type?: string; message?: { role?: string; content?: unknown } };
  try {
    event = JSON.parse(trimmed) as typeof event;
  } catch {
    return;
  }
  if ((event.type === "message_end" || event.type === "tool_result_end") && event.message) {
    messages.push(event.message);
  }
}

export interface RunWorkerOptions {
  agentName: string;
  task: string;
  scratchDir: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  spawnImpl?: SpawnImpl;
  piEntry?: string;
  extraExtensions?: string[];
  agents?: AgentConfig[];
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
  const invocation = buildChildInvocation({
    piEntry: options.piEntry ?? piCliPath(),
    agent,
    task: options.task,
    promptFile,
    extraExtensions: extra,
  });

  const spawnImpl = options.spawnImpl ?? (spawn as SpawnImpl);
  const messages: Array<{ role?: string; content?: unknown }> = [];
  let stderr = "";
  let aborted = false;
  const timeoutMs = options.timeoutMs ?? Number(process.env.BSA_SUBAGENT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  try {
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
        if (buffer.trim()) parsePiJsonLine(buffer, messages);
        resolve(code);
      };

      proc.stdout?.on("data", (chunk: Buffer | string) => {
        buffer += String(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) parsePiJsonLine(line, messages);
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
      const timer = setTimeout(killProc, timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        killProc();
      };
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener("abort", onAbort, { once: true });
      proc.on("close", () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      });
    });

    return {
      agent: agent.name,
      text: textFromMessages(messages),
      exitCode,
      stderr,
      aborted,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
