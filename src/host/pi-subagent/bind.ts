/**
 * Parent-only: a `subagent` tool (Pi JSON child) and scratch file tools.
 * Coding builtins stay off on this session. /plan is in-session plan-mode, not a worker.
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import {
  formatScratchInventory,
  formatScratchRead,
  listScratchFiles,
  readScratchFile,
  type ScratchListing,
  writeScratchFile,
} from "../../core/scratch.ts";
import { coreRoot, goalPaths } from "../../core/paths.ts";
import type { ExtensionAPI, ExtensionContext, RegisteredTool, ToolResult } from "../../pi-api.ts";
import { textResult } from "../../pi-api.ts";
import { withToolView } from "../pi-tool-view.ts";
import { hashOf, type MetricsSink, type PayloadSink } from "../../runtime/metrics.ts";
import { discoverPackagedAgents } from "./discover.ts";
import {
  CONFIRM_WAIT_MS,
  DEFAULT_TIMEOUT_MS,
  formatDurationMs,
  MAX_EXTENSIONS,
  MAX_TOTAL_TIMEOUT_MS,
  resolveTimeoutMs,
  runWorker,
  type ExtendRequest,
  type WorkerResult,
  type WorkerUpdate,
} from "./spawn.ts";

export { PLAN_COMMAND } from "../pi-plan-mode.ts";

export const SUBAGENT_TOOL_NAME = "subagent";
export const SCRATCH_WRITE_TOOL_NAME = "scratch_write";
export const SCRATCH_LS_TOOL_NAME = "scratch_ls";
export const SCRATCH_READ_TOOL_NAME = "scratch_read";
export const PARENT_TOOL_NAMES = [
  SUBAGENT_TOOL_NAME,
  SCRATCH_WRITE_TOOL_NAME,
  SCRATCH_LS_TOOL_NAME,
  SCRATCH_READ_TOOL_NAME,
] as const;
export const PLAN_FILE = "plan.md";
export const PLANNER_AGENT_NAME = "planner";
/** About 500 tokens; the parent must not ingest the child transcript. */
export const DIGEST_MAX_CHARS = 2000;

export const CHAT_WORKER_HINT =
  "/plan toggles read-only plan mode in this session (same model; Ctrl+P to change). " +
  "For code, files, unzip, or public curl, call subagent with agent=coder. " +
  `That child is a real Pi coding agent in this goal's scratch directory. ` +
  `Default wall ${formatDurationMs(DEFAULT_TIMEOUT_MS)} (cap ${formatDurationMs(MAX_TOTAL_TIMEOUT_MS)}, ` +
  `${MAX_EXTENSIONS} extensions); the host asks before extending. ` +
  "Files in scratch are the artifact — scratch_ls / scratch_read, not peek file://. " +
  "After an abort, read those files (offset if truncated) before spawning coder again; do not rebuild. " +
  "Abort and provider quota kill the child; partial files may still be there.";

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

/** Newest-first names and sizes so a later turn resumes instead of rebuilding. */
export async function standingScratchPrompt(goalId: string, root?: string): Promise<string> {
  const scratchDir = goalPaths(coreRoot(root), goalId).scratchDir;
  const listings = await listScratchFiles(scratchDir);
  if (listings.length === 0) return "";
  return [
    "This goal's scratch already has files. Continue from them; do not rebuild. " +
      "After an abort, scratch_read before spawning coder again. If a read is truncated, pass offset.",
    formatScratchInventory(listings, { maxLines: 15, newestFirst: true }),
  ].join("\n");
}

export function withScratchResume(task: string, listings: ScratchListing[]): string {
  if (listings.length === 0) return task;
  return [
    "Scratch already has files. Continue from them; do not rebuild or re-fetch what is on disk.",
    formatScratchInventory(listings, { maxLines: 20, newestFirst: true }),
    "",
    task,
  ].join("\n");
}

export interface SubagentEvidence {
  metrics: MetricsSink;
  payloads: PayloadSink;
  turn?: () => number;
}

export interface SubagentHostOptions {
  goalId: string;
  root?: string;
  runtime?: SubagentRuntime;
  evidence?: SubagentEvidence;
}

export interface SubagentRuntime {
  run(input: {
    agentName: string;
    task: string;
    scratchDir: string;
    signal?: AbortSignal;
    onUpdate?: WorkerUpdate;
    timeoutMs?: number;
    confirmExtend?: (request: ExtendRequest) => Promise<boolean>;
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

function recordParentTool(options: SubagentHostOptions, tool: string, text: string): void {
  if (!options.evidence) return;
  const turn = options.evidence.turn?.() ?? 0;
  const hash = hashOf(text);
  options.evidence.payloads.write({
    at: new Date().toISOString(),
    turn,
    tool,
    bytes: text.length,
    hash,
    text,
  });
  options.evidence.metrics.record({
    kind: "tool_result",
    turn,
    tool,
    bytes: text.length,
    hash,
  });
}

async function formatWorkerReply(result: WorkerResult, scratchDir: string): Promise<string> {
  const body = result.text.trim() || result.stderr.trim() || result.errorMessage?.trim() || "(no output)";
  const listings = await listScratchFiles(scratchDir);
  const resume = workerIsError(result)
    ? "Partial files remain. Do not repeat the same harvest. scratch_read the artifacts (offset if truncated). The next coder task must name only the gap."
    : "";
  const lines = [
    `${result.agent} finished (exit ${result.exitCode}${result.aborted ? ", aborted" : ""}).`,
    `Scratch: ${scratchDir}`,
    formatScratchInventory(listings, { newestFirst: true }),
    resume,
    "",
    digestText(body),
  ].filter((line) => line !== "");
  return lines.join("\n");
}

function workerIsError(result: WorkerResult): boolean {
  return result.exitCode !== 0 || result.aborted || Boolean(result.errorMessage);
}

async function confirmLongerRun(
  ctx: ExtensionContext | undefined,
  requestedMs: number,
  defaultMs: number,
): Promise<number> {
  const capped = Math.min(requestedMs, MAX_TOTAL_TIMEOUT_MS);
  if (!(capped > defaultMs)) return capped > 0 ? capped : defaultMs;
  if (!ctx?.ui?.confirm) return defaultMs;
  const ok = await ctx.ui.confirm(
    "Allow a longer coder run?",
    `Requested ${formatDurationMs(capped)} (default ${formatDurationMs(defaultMs)}). Cap ${formatDurationMs(MAX_TOTAL_TIMEOUT_MS)}.`,
  );
  return ok ? capped : defaultMs;
}

function confirmExtend(ctx: ExtensionContext | undefined) {
  return async (request: ExtendRequest): Promise<boolean> => {
    if (!ctx?.ui?.confirm) return false;
    return ctx.ui.confirm(
      "Coder still running",
      `About ${formatDurationMs(request.elapsedMs)} elapsed. Allow another ${formatDurationMs(request.sliceMs)}? ` +
        `(${request.extensionsUsed}/${MAX_EXTENSIONS} extensions used; confirm ignored after ${formatDurationMs(CONFIRM_WAIT_MS)}.)`,
    );
  };
}

export function subagentTool(options: SubagentHostOptions): RegisteredTool {
  const runtime = options.runtime ?? defaultRuntime();
  const available = agentList();
  const slice = formatDurationMs(DEFAULT_TIMEOUT_MS);
  const cap = formatDurationMs(MAX_TOTAL_TIMEOUT_MS);
  return {
    name: SUBAGENT_TOOL_NAME,
    label: "Subagent",
    description: [
      "Delegate one task to a packaged coding worker with isolated context.",
      "Prefer agent=coder for files, unzip, public curl, extracts, or conversion.",
      `Agents: ${available}. Single mode only (agent + task).`,
      "The worker's cwd is this goal's scratch directory. It does not share the browser profile.",
      `Default wall ${slice}; the host asks before extending (cap ${cap}, ${MAX_EXTENSIONS} extensions).`,
      `timeoutMs is a request, not a grant: above the default needs operator confirm, never unbounded.`,
      "The digest is short; files in scratch are the artifact. Use scratch_ls / scratch_read. Public curl only.",
      "The worker is told what is already in scratch. Give it the gap, not a restart.",
      "Abort and provider quota kill the child. Chunk work that may exceed one slice.",
    ].join(" "),
    parameters: Type.Object({
      agent: Type.String({ description: `Worker to invoke (${available}). Use coder for code and files.` }),
      task: Type.String({ description: "Task for that worker" }),
      timeoutMs: Type.Optional(Type.Number({
        description: `Requested wall in ms (default ${DEFAULT_TIMEOUT_MS}). Above default asks the operator.`,
      })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      if (params.tasks != null || params.chain != null) {
        return finish(
          options,
          SUBAGENT_TOOL_NAME,
          textResult(
            "Phase 1 supports a single agent. Omit tasks/chain and pass agent + task.",
            { error: "unsupported_mode" },
            true,
          ),
        );
      }
      const agent = typeof params.agent === "string" ? params.agent.trim() : "";
      const task = typeof params.task === "string" ? params.task.trim() : "";
      if (!agent || !task) {
        return finish(options, SUBAGENT_TOOL_NAME, textResult("Need agent and task.", { error: "bad_args" }, true));
      }
      const defaultMs = resolveTimeoutMs();
      const requested = typeof params.timeoutMs === "number" ? params.timeoutMs : undefined;
      const timeoutMs = requested != null
        ? await confirmLongerRun(ctx, requested, defaultMs)
        : defaultMs;
      const scratchDir = await ensureScratch(options.goalId, options.root);
      const listings = await listScratchFiles(scratchDir);
      const result = await runtime.run({
        agentName: agent,
        task: withScratchResume(task, listings),
        scratchDir,
        signal,
        timeoutMs,
        confirmExtend: confirmExtend(ctx),
        onUpdate: typeof onUpdate === "function"
          ? (update) => {
              (onUpdate as WorkerUpdate)(update);
            }
          : undefined,
      });
      const text = await formatWorkerReply(result, scratchDir);
      return finish(
        options,
        SUBAGENT_TOOL_NAME,
        textResult(text, {
          agent,
          scratchDir,
          exitCode: result.exitCode,
          aborted: result.aborted,
          errorMessage: result.errorMessage,
          stopReason: result.stopReason,
        }, workerIsError(result)),
      );
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
        return finish(
          options,
          SCRATCH_WRITE_TOOL_NAME,
          textResult("scratch_write needs a file name.", { error: "bad_args" }, true),
        );
      }
      const scratchDir = await ensureScratch(options.goalId, options.root);
      const written = await writeScratchFile(scratchDir, name, content);
      if ("error" in written) {
        return finish(
          options,
          SCRATCH_WRITE_TOOL_NAME,
          textResult(written.error, { error: "path_rejected" }, true),
        );
      }
      return finish(
        options,
        SCRATCH_WRITE_TOOL_NAME,
        textResult(`Wrote ${written.path}`, {
          path: written.path,
          bytes: Buffer.byteLength(content, "utf8"),
        }),
      );
    },
  };
}

export function scratchLsTool(options: SubagentHostOptions): RegisteredTool {
  return {
    name: SCRATCH_LS_TOOL_NAME,
    label: "List scratch",
    description:
      "List files in this goal's scratch directory. Use this instead of peek file://. Paths stay inside scratch.",
    parameters: Type.Object({}),
    async execute() {
      const scratchDir = await ensureScratch(options.goalId, options.root);
      const listings = await listScratchFiles(scratchDir);
      return finish(
        options,
        SCRATCH_LS_TOOL_NAME,
        textResult(formatScratchInventory(listings), {
          scratchDir,
          count: listings.length,
          files: listings,
        }),
      );
    },
  };
}

export function scratchReadTool(options: SubagentHostOptions): RegisteredTool {
  return {
    name: SCRATCH_READ_TOOL_NAME,
    label: "Read scratch",
    description:
      "Read a text file from this goal's scratch directory. Capped. Pass offset to continue a truncated read. Binary is refused. Not a browser peek.",
    parameters: Type.Object({
      name: Type.String({ description: "Relative path under scratch" }),
      offset: Type.Optional(Type.Number({
        description: "Character offset to start from after a truncated read (default 0)",
      })),
    }),
    async execute(_id, params) {
      const name = typeof params.name === "string" ? params.name : "";
      const offset = typeof params.offset === "number" ? params.offset : 0;
      if (!name.trim()) {
        return finish(
          options,
          SCRATCH_READ_TOOL_NAME,
          textResult("scratch_read needs a file name.", { error: "bad_args" }, true),
        );
      }
      const scratchDir = await ensureScratch(options.goalId, options.root);
      const read = await readScratchFile(scratchDir, name, DIGEST_MAX_CHARS, offset);
      if ("error" in read) {
        return finish(
          options,
          SCRATCH_READ_TOOL_NAME,
          textResult(read.error, { error: "read_failed" }, true),
        );
      }
      return finish(
        options,
        SCRATCH_READ_TOOL_NAME,
        textResult(formatScratchRead(name, read), {
          path: name,
          bytes: read.bytes,
          totalChars: read.totalChars,
          offset: read.offset,
          nextOffset: read.nextOffset,
          truncated: read.truncated,
        }),
      );
    },
  };
}

function finish(options: SubagentHostOptions, tool: string, result: ToolResult): ToolResult {
  const text = result.content.map((part) => ("text" in part ? part.text : "")).join("");
  recordParentTool(options, tool, text);
  return result;
}

/** Registers parent-only tools. /plan is bindPlanMode, not a planner spawn. */
export function bindSubagent(pi: ExtensionAPI, options: SubagentHostOptions): string[] {
  for (const tool of [
    subagentTool(options),
    scratchWriteTool(options),
    scratchLsTool(options),
    scratchReadTool(options),
  ]) {
    pi.registerTool(withToolView(tool));
  }
  return [...PARENT_TOOL_NAMES];
}
