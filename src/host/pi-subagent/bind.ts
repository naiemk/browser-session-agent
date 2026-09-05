/**
 * Parent-only: a `subagent` tool and `/plan`. Coding builtins stay off on this session.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import { coreRoot, goalPaths } from "../../core/paths.ts";
import type { ExtensionAPI, ExtensionContext, RegisteredTool } from "../../pi-api.ts";
import { textResult } from "../../pi-api.ts";
import { discoverPackagedAgents } from "./discover.ts";
import { runWorker, type WorkerResult } from "./spawn.ts";
import {
  AUTO_PLAN_TIMEOUT_MS,
  PLAN_DIGEST_HEADER,
  prependPlanDigest,
  shouldAutoPlan,
} from "./auto-plan.ts";

export { AUTO_PLAN_TIMEOUT_MS, PLAN_DIGEST_HEADER, prependPlanDigest, shouldAutoPlan };

export const SUBAGENT_TOOL_NAME = "subagent";
export const PLAN_COMMAND = "plan";
export const PLAN_FILE = "plan.md";
/** About 500 tokens; the parent must not ingest the child transcript. */
export const DIGEST_MAX_CHARS = 2000;

export const CHAT_WORKER_HINT =
  "For work that spans many entities, or that needs a written brief, a tailored document, or code over files, use the subagent tool or /plan. Those workers share this goal's scratch directory, not the browser profile. You still have no shell.";

export interface SubagentHostOptions {
  goalId: string;
  root?: string;
  runtime?: SubagentRuntime;
}

export interface SubagentRuntime {
  run(input: {
    agentName: string;
    task: string;
    scratchDir: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<WorkerResult>;
}

export function digestText(text: string, max = DIGEST_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}\n\n[truncated]`;
}

export async function ensureScratch(goalId: string, root?: string): Promise<string> {
  const paths = goalPaths(coreRoot(root), goalId);
  await mkdir(paths.scratchDir, { recursive: true });
  return paths.scratchDir;
}

function defaultRuntime(): SubagentRuntime {
  return {
    run(input) {
      return runWorker(input);
    },
  };
}

function agentList(): string {
  const names = discoverPackagedAgents().map((agent) => agent.name);
  return names.length > 0 ? names.join(", ") : "none";
}

async function savePlanIfNeeded(scratchDir: string, text: string): Promise<string> {
  const file = path.join(scratchDir, PLAN_FILE);
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch {
    existing = "";
  }
  if (!existing.trim() && text.trim()) {
    await writeFile(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  }
  return file;
}

export interface AutoPlanRequest {
  text: string;
  goalId: string;
  root?: string;
  runtime?: SubagentRuntime;
  attempted: Set<string>;
  timeoutMs?: number;
  notify?: (message: string, level?: "info" | "warning" | "error") => void;
}

export interface AutoPlanResult {
  planned: boolean;
  digest?: string;
  planFile?: string;
}

/**
 * First chat message only. Skip if the heuristic says no or plan.md already exists.
 * Planner failure does not block the operate turn.
 */
export async function maybeAutoPlan(options: AutoPlanRequest): Promise<AutoPlanResult> {
  if (options.attempted.has(options.goalId)) return { planned: false };
  options.attempted.add(options.goalId);
  if (!shouldAutoPlan(options.text)) return { planned: false };

  const scratchDir = await ensureScratch(options.goalId, options.root);
  const planFile = path.join(scratchDir, PLAN_FILE);
  try {
    const existing = await readFile(planFile, "utf8");
    if (existing.trim()) return { planned: false, planFile };
  } catch {
    /* no plan yet */
  }

  options.notify?.("Planning…", "info");
  const runtime = options.runtime ?? defaultRuntime();
  let result: WorkerResult;
  try {
    result = await runtime.run({
      agentName: "planner",
      task: options.text,
      scratchDir,
      timeoutMs: options.timeoutMs ?? AUTO_PLAN_TIMEOUT_MS,
    });
  } catch (err) {
    options.notify?.(err instanceof Error ? err.message : String(err), "warning");
    return { planned: false, planFile };
  }

  await savePlanIfNeeded(scratchDir, result.text);
  let body = "";
  try {
    body = await readFile(planFile, "utf8");
  } catch {
    body = "";
  }
  if (!body.trim() || result.aborted || result.exitCode !== 0) {
    options.notify?.(
      result.stderr.trim() || "Planner did not write a plan. Continuing without one.",
      "warning",
    );
    return { planned: false, planFile };
  }
  const digest = digestText(result.text.trim() || body);
  options.notify?.(`Plan written to ${planFile}`, "info");
  return { planned: true, digest, planFile };
}

function formatWorkerReply(result: WorkerResult, scratchDir: string): string {
  const body = result.text.trim() || result.stderr.trim() || "(no output)";
  const lines = [
    `${result.agent} finished (exit ${result.exitCode}${result.aborted ? ", aborted" : ""}).`,
    `Scratch: ${scratchDir}`,
    "",
    digestText(body),
  ];
  return lines.join("\n");
}

export function subagentTool(options: SubagentHostOptions): RegisteredTool {
  const runtime = options.runtime ?? defaultRuntime();
  const available = agentList();
  return {
    name: SUBAGENT_TOOL_NAME,
    label: "Subagent",
    description: [
      "Delegate one task to a packaged worker with isolated context.",
      `Agents: ${available}. Single mode only (agent + task).`,
      "The worker's cwd is this goal's scratch directory. It does not share the browser profile.",
    ].join(" "),
    parameters: Type.Object({
      agent: Type.String({ description: `Worker to invoke (${available})` }),
      task: Type.String({ description: "Task for that worker" }),
    }),
    async execute(_id, params, signal) {
      if (params.tasks != null || params.chain != null) {
        return textResult(
          "Phase 1 supports a single agent. Omit tasks/chain and pass agent + task.",
          { error: "unsupported_mode" },
          true,
        );
      }
      const agent = typeof params.agent === "string" ? params.agent.trim() : "";
      const task = typeof params.task === "string" ? params.task.trim() : "";
      if (!agent || !task) {
        return textResult("Need agent and task.", { error: "bad_args" }, true);
      }
      const scratchDir = await ensureScratch(options.goalId, options.root);
      const result = await runtime.run({
        agentName: agent,
        task,
        scratchDir,
        signal,
      });
      const isError = result.exitCode !== 0 || result.aborted;
      return textResult(formatWorkerReply(result, scratchDir), {
        agent,
        scratchDir,
        exitCode: result.exitCode,
        aborted: result.aborted,
      }, isError);
    },
  };
}

export function bindPlanCommand(pi: ExtensionAPI, options: SubagentHostOptions): void {
  const runtime = options.runtime ?? defaultRuntime();
  pi.registerCommand(PLAN_COMMAND, {
    description: "Spawn the planner worker and write scratch/plan.md",
    async handler(args, ctx: ExtensionContext) {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("Usage: /plan <what to plan>", "warning");
        return;
      }
      const scratchDir = await ensureScratch(options.goalId, options.root);
      const result = await runtime.run({
        agentName: "planner",
        task,
        scratchDir,
      });
      const planFile = await savePlanIfNeeded(scratchDir, result.text);
      let body = "";
      try {
        body = await readFile(planFile, "utf8");
      } catch {
        body = "";
      }
      if (!body.trim()) {
        ctx.ui.notify(
          result.stderr.trim() || "Planner produced no plan.md.",
          "error",
        );
        return;
      }
      const digest = digestText(result.text.trim() || body);
      ctx.ui.notify(`Plan written to ${planFile}\n\n${digest}`);
    },
  });
}

export function bindSubagent(pi: ExtensionAPI, options: SubagentHostOptions): string {
  pi.registerTool(subagentTool(options));
  bindPlanCommand(pi, options);
  const attempted = new Set<string>();
  const runtime = options.runtime ?? defaultRuntime();
  pi.on("before_agent_start", async (...args: unknown[]) => {
    const event = args[0] as { prompt?: string } | undefined;
    const ctx = args[1] as ExtensionContext | undefined;
    const prompt = typeof event?.prompt === "string" ? event.prompt : "";
    const result = await maybeAutoPlan({
      text: prompt,
      goalId: options.goalId,
      root: options.root,
      runtime,
      attempted,
      notify: (message, level) => ctx?.ui.notify(message, level),
    });
    if (!result.digest) return undefined;
    return {
      message: {
        customType: "plan-digest",
        content: `${PLAN_DIGEST_HEADER}\n\n${result.digest}`,
        display: true,
      },
    };
  });
  return SUBAGENT_TOOL_NAME;
}
