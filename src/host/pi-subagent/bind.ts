/**
 * Parent-only: a `subagent` tool (Pi JSON child) and scratch_write.
 * Coding builtins stay off on this session. /plan is in-session plan-mode, not a worker.
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import { writeScratchFile } from "../../core/scratch.ts";
import { coreRoot, goalPaths } from "../../core/paths.ts";
import type { ExtensionAPI, RegisteredTool } from "../../pi-api.ts";
import { textResult } from "../../pi-api.ts";
import { discoverPackagedAgents } from "./discover.ts";
import { runWorker, type WorkerResult, type WorkerUpdate } from "./spawn.ts";

export { PLAN_COMMAND } from "../pi-plan-mode.ts";

export const SUBAGENT_TOOL_NAME = "subagent";
export const SCRATCH_WRITE_TOOL_NAME = "scratch_write";
export const PLAN_FILE = "plan.md";
export const PLANNER_AGENT_NAME = "planner";
/** About 500 tokens; the parent must not ingest the child transcript. */
export const DIGEST_MAX_CHARS = 2000;

export const CHAT_WORKER_HINT =
  "/plan toggles read-only plan mode in this session (same model; Ctrl+P to change). " +
  "For code, files, unzip, or public curl, call subagent with agent=coder. " +
  "That child is a real Pi coding agent in this goal's scratch directory.";

export function plannerModel(): string {
  return discoverPackagedAgents().find((agent) => agent.name === PLANNER_AGENT_NAME)?.model
    ?? PLANNER_AGENT_NAME;
}

/**
 * If scratch/plan.md already exists, remind the operate agent. Not a spawned planner.
 */
export async function standingPlanPrompt(goalId: string, root?: string): Promise<string> {
  const file = path.join(goalPaths(coreRoot(root), goalId).scratchDir, PLAN_FILE);
  let body = "";
  try {
    body = await readFile(file, "utf8");
  } catch {
    return "";
  }
  if (!body.trim()) return "";
  return [
    `scratch/${PLAN_FILE} already exists. Follow it. Missing inputs: ask_user and wait; never invent defaults.`,
    digestText(body),
  ].join("\n\n");
}

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
    onUpdate?: WorkerUpdate;
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

function formatWorkerReply(result: WorkerResult, scratchDir: string): string {
  const body = result.text.trim() || result.stderr.trim() || result.errorMessage?.trim() || "(no output)";
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
      "Delegate one task to a packaged coding worker with isolated context.",
      "Prefer agent=coder for files, unzip, public curl, extracts, or conversion.",
      `Agents: ${available}. Single mode only (agent + task).`,
      "The worker's cwd is this goal's scratch directory. It does not share the browser profile.",
    ].join(" "),
    parameters: Type.Object({
      agent: Type.String({ description: `Worker to invoke (${available}). Use coder for code and files.` }),
      task: Type.String({ description: "Task for that worker" }),
    }),
    async execute(_id, params, signal, onUpdate) {
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
        onUpdate: typeof onUpdate === "function"
          ? (update) => {
              (onUpdate as WorkerUpdate)(update);
            }
          : undefined,
      });
      const isError = result.exitCode !== 0 || result.aborted || Boolean(result.errorMessage);
      return textResult(formatWorkerReply(result, scratchDir), {
        agent,
        scratchDir,
        exitCode: result.exitCode,
        aborted: result.aborted,
        errorMessage: result.errorMessage,
        stopReason: result.stopReason,
      }, isError);
    },
  };
}

export function scratchWriteTool(options: SubagentHostOptions): RegisteredTool {
  return {
    name: SCRATCH_WRITE_TOOL_NAME,
    label: "Write scratch",
    description:
      "Write a text file into this goal's scratch directory, where the coder subagent can read it. " +
      "Use this instead of save_artifact when the next step is code. Paths stay inside scratch.",
    parameters: Type.Object({
      name: Type.String({ description: "Relative path under scratch, e.g. notes.md or extracts/job-1.md" }),
      content: Type.String({ description: "File contents" }),
    }),
    async execute(_id, params) {
      const name = typeof params.name === "string" ? params.name : "";
      const content = typeof params.content === "string" ? params.content : "";
      if (!name.trim()) {
        return textResult("scratch_write needs a file name.", { error: "bad_args" }, true);
      }
      const scratchDir = await ensureScratch(options.goalId, options.root);
      const written = await writeScratchFile(scratchDir, name, content);
      if ("error" in written) {
        return textResult(written.error, { error: "path_rejected" }, true);
      }
      return textResult(`Wrote ${written.path}`, {
        path: written.path,
        bytes: Buffer.byteLength(content, "utf8"),
      });
    },
  };
}

/** Registers parent-only tools. /plan is bindPlanMode, not a planner spawn. */
export function bindSubagent(pi: ExtensionAPI, options: SubagentHostOptions): string[] {
  pi.registerTool(subagentTool(options));
  pi.registerTool(scratchWriteTool(options));
  return [SUBAGENT_TOOL_NAME, SCRATCH_WRITE_TOOL_NAME];
}
