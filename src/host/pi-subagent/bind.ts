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
import { PlanStore } from "../../core/plan.ts";
import { resolveGoalId, type GoalIdRef } from "../pi-session-goal.ts";
import type { ExtensionAPI, ExtensionContext, RegisteredTool, ToolResult } from "../../pi-api.ts";
import { textResult } from "../../pi-api.ts";
import { withToolView } from "../pi-tool-view.ts";
import { hashOf, type MetricsSink, type PayloadSink } from "../../runtime/metrics.ts";
import { discoverPackagedAgents } from "./discover.ts";
import {
  applyOperatorChoice,
  dispatchAllowed,
  emptyProgressState,
  evaluateAttempt,
  fingerprintTask,
  formatHaltMessage,
  latestArtifact,
  liveStatusLine,
  previewTask,
  reconstructProgress,
  STAGNATION_CHOICES,
  SUBAGENT_PROGRESS_ENTRY,
  type SemanticFingerprint,
  type SubagentProgressState,
} from "./progress.ts";
import { renderSubagentCall, renderSubagentResult } from "./view.ts";
import {
  CONFIRM_WAIT_MS,
  DEFAULT_TIMEOUT_MS,
  formatDurationMs,
  MAX_EXTENSIONS,
  MAX_TOTAL_TIMEOUT_MS,
  resolveTimeoutMs,
  runWorker,
  formatUsageLine,
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
  "scratch_read is capped; pass offset to continue a truncated read. " +
  "Abort and provider quota kill the child; partial files may still be there. " +
  "Two failed coder slices without a checkpoint, or a work stream that does not " +
  "advance the declared deliverable, stop and wait for the operator.";

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

/** Newest-first names and sizes. No continue/rebuild advice — the agents choose. */
export async function standingScratchPrompt(goalId: string, root?: string): Promise<string> {
  const scratchDir = goalPaths(coreRoot(root), goalId).scratchDir;
  const listings = await listScratchFiles(scratchDir);
  if (listings.length === 0) return "";
  return formatScratchInventory(listings, { maxLines: 15, newestFirst: true });
}

/** Prepend cwd facts. Empty scratch leaves the task unchanged. */
export function withScratchInventory(task: string, listings: ScratchListing[]): string {
  if (listings.length === 0) return task;
  return [formatScratchInventory(listings, { maxLines: 20, newestFirst: true }), "", task].join("\n");
}

export interface SubagentEvidence {
  metrics: MetricsSink;
  payloads: PayloadSink;
  turn?: () => number;
}

export interface SubagentHostOptions {
  goalId: GoalIdRef;
  root?: string;
  runtime?: SubagentRuntime;
  evidence?: SubagentEvidence;
  /** Shared across resume via appendEntry. Tests inject it. */
  progress?: SubagentProgressState;
  host?: ExtensionAPI;
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

function defaultRuntime(options: SubagentHostOptions): SubagentRuntime {
  return {
    run(input) {
      return runWorker({ ...input, goalId: resolveGoalId(options.goalId) });
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
  const usage = result.usage ? formatUsageLine(result.usage, result.model) : "";
  const latest = result.toolPreviews?.at(-1) ?? result.tools?.at(-1);
  const costLine = [usage, latest].filter(Boolean).join(" · ");
  const lines = [
    `${result.agent} finished (exit ${result.exitCode}${result.aborted ? ", aborted" : ""}).`,
    ...(costLine ? [costLine] : []),
    `Scratch: ${scratchDir}`,
    formatScratchInventory(listings, { newestFirst: true }),
    "",
    digestText(body),
  ];
  return lines.join("\n");
}

function workerIsError(result: WorkerResult): boolean {
  return result.exitCode !== 0 || result.aborted || Boolean(result.errorMessage);
}

export class SubagentFailure extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SubagentFailure";
  }
}

function persistProgress(pi: ExtensionAPI | undefined, state: SubagentProgressState): void {
  pi?.appendEntry?.(SUBAGENT_PROGRESS_ENTRY, state);
}

function latestPlanStep(ctx: ExtensionContext | undefined): number | undefined {
  const entries = ctx?.sessionManager?.getEntries?.() ?? [];
  const plan = [...entries]
    .reverse()
    .find((entry) => entry.customType === "plan-mode") as
    | { data?: { todos?: Array<{ step: number; completed?: boolean }> } }
    | undefined;
  const active = plan?.data?.todos?.find((todo) => !todo.completed);
  return active?.step;
}

async function recordPlanRevision(
  options: SubagentHostOptions,
  revision: { reason: string; from?: string; to?: string },
): Promise<void> {
  const store = await PlanStore.tryOpen(coreRoot(options.root), resolveGoalId(options.goalId));
  if (!store) return;
  await store.recordRevision(revision);
}

function applyLiveUi(
  ctx: ExtensionContext | undefined,
  details: Record<string, unknown> | undefined,
): void {
  if (!ctx?.ui) return;
  const agent = typeof details?.agent === "string" ? details.agent : "coder";
  const line = liveStatusLine({
    agent,
    elapsedMs: typeof details?.elapsedMs === "number" ? details.elapsedMs : 0,
    timeoutMs: typeof details?.timeoutMs === "number" ? details.timeoutMs : undefined,
    latestTool: typeof details?.latestTool === "string" ? details.latestTool : undefined,
    turns: typeof details?.turns === "number" ? details.turns : undefined,
    usage: typeof details?.usage === "string" ? details.usage : undefined,
    running: details?.running !== false,
    workStream: typeof details?.workStream === "string" ? details.workStream : undefined,
  });
  ctx.ui.setWorkingMessage?.(line);
  ctx.ui.setStatus?.("subagent", line);
  const widget = [
    typeof details?.task === "string" ? previewTask(details.task, 72) : undefined,
    line,
    typeof details?.latestTool === "string" ? `→ ${details.latestTool}` : undefined,
  ].filter((item): item is string => Boolean(item));
  ctx.ui.setWidget?.("subagent", widget);
}

function clearLiveUi(ctx: ExtensionContext | undefined): void {
  ctx?.ui.setWorkingMessage?.();
  ctx?.ui.setStatus?.("subagent", undefined);
  ctx?.ui.setWidget?.("subagent", undefined);
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

function confirmExtend(ctx: ExtensionContext | undefined, task: string) {
  return async (request: ExtendRequest): Promise<boolean> => {
    if (!ctx?.ui?.confirm) return false;
    const taskLine = previewTask(request.taskPreview ?? task, 72);
    const latest = request.latestTool ? ` Latest: ${request.latestTool}.` : "";
    return ctx.ui.confirm(
      "Coder still running",
      `${taskLine}\nAbout ${formatDurationMs(request.elapsedMs)} elapsed.${latest} Allow another ${formatDurationMs(request.sliceMs)}? ` +
        `(${request.extensionsUsed}/${MAX_EXTENSIONS} extensions used; confirm ignored after ${formatDurationMs(CONFIRM_WAIT_MS)}.)`,
    );
  };
}

function haltResult(text: string, details: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text }],
    details,
    terminate: true,
  };
}

async function askRecovery(
  ctx: ExtensionContext | undefined,
  state: SubagentProgressState,
): Promise<SubagentProgressState> {
  ctx?.ui.notify(formatHaltMessage(state, STAGNATION_CHOICES), "warning");
  if (!ctx?.ui?.select) return state;
  const choice = await ctx.ui.select("Coder loop — what next?", [...STAGNATION_CHOICES]);
  if (!choice) return state;
  let reason: string | undefined;
  if (
    choice.startsWith("Continue once") ||
    choice.startsWith("Change strategy") ||
    choice.startsWith("Narrow scope")
  ) {
    reason = ctx.ui.input
      ? await ctx.ui.input(
          choice.startsWith("Continue once") ? "Why continue this stream once?" : "New strategy or narrower scope",
          choice.startsWith("Change strategy") ? "e.g. write the pitches into pitches.md" : "What should change?",
        )
      : undefined;
  }
  return applyOperatorChoice(state, choice, reason);
}

export function subagentTool(options: SubagentHostOptions): RegisteredTool {
  const runtime = options.runtime ?? defaultRuntime(options);
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
      "The worker cwd is this goal's scratch; existing files are listed on the task.",
      "Abort and provider quota kill the child. Chunk work that may exceed one slice.",
      "Do not retry the same harvest after the host stops the stream; wait for the operator.",
    ].join(" "),
    parameters: Type.Object({
      agent: Type.String({ description: `Worker to invoke (${available}). Use coder for code and files.` }),
      task: Type.String({ description: "Task for that worker" }),
      timeoutMs: Type.Optional(Type.Number({
        description: `Requested wall in ms (default ${DEFAULT_TIMEOUT_MS}). Above default asks the operator.`,
      })),
    }),
    executionMode: "sequential",
    renderCall: (args, theme) => renderSubagentCall(args, theme),
    renderResult: (result, renderOptions, theme) => renderSubagentResult(result, renderOptions, theme),
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

      const progress = options.progress ?? (options.progress = emptyProgressState());
      const incoming = fingerprintTask({
        task,
        planStep: latestPlanStep(ctx),
      });
      const gate = dispatchAllowed(progress, incoming);
      if (!gate.allow) {
        let next = progress;
        if (ctx?.hasUI !== false) {
          next = await askRecovery(ctx, { ...progress, blockReason: gate.reason ?? progress.blockReason });
          Object.assign(progress, next);
          persistProgress(options.host, progress);
          const latest = progress.revisions.at(-1);
          if (latest) await recordPlanRevision(options, latest);
        }
        const retry = dispatchAllowed(progress, incoming);
        if (!retry.allow) {
          const text = formatHaltMessage(progress, STAGNATION_CHOICES);
          ctx?.ui.notify(text, "warning");
          return finish(
            options,
            SUBAGENT_TOOL_NAME,
            haltResult(text, {
              agent,
              task,
              halt: true,
              evaluation: progress.evaluation ?? "replan",
              workStream: incoming.workStream,
              error: retry.reason ?? gate.reason,
            }),
          );
        }
      }

      const defaultMs = resolveTimeoutMs();
      const requested = typeof params.timeoutMs === "number" ? params.timeoutMs : undefined;
      const timeoutMs = requested != null
        ? await confirmLongerRun(ctx, requested, defaultMs)
        : defaultMs;
      const scratchDir = await ensureScratch(resolveGoalId(options.goalId), options.root);
      const listings = await listScratchFiles(scratchDir);
      const started = Date.now();
      applyLiveUi(ctx, {
        agent,
        task,
        running: true,
        elapsedMs: 0,
        timeoutMs,
        workStream: incoming.workStream,
      });
      let result: WorkerResult;
      try {
        result = await runtime.run({
          agentName: agent,
          task: withScratchInventory(task, listings),
          scratchDir,
          signal,
          timeoutMs,
          confirmExtend: confirmExtend(ctx, task),
          onUpdate: (update) => {
            const details = {
              ...(update.details ?? {}),
              workStream: incoming.workStream,
            };
            applyLiveUi(ctx, details);
            if (typeof onUpdate === "function") {
              (onUpdate as WorkerUpdate)({
                content: update.content,
                details,
              });
            }
          },
        });
      } finally {
        clearLiveUi(ctx);
      }

      const afterListings = await listScratchFiles(scratchDir);
      const fingerprint: SemanticFingerprint = fingerprintTask({
        task,
        planStep: incoming.planStep,
        listings: afterListings,
        declaredDeliverable: incoming.deliverable,
      });
      const decision = evaluateAttempt(progress, {
        fingerprint,
        attemptOk: !workerIsError(result),
        checkpoint: fingerprint.acceptedHashes.length > 0,
        elapsedMs: result.elapsedMs ?? Date.now() - started,
        agent,
        task,
        artifact: latestArtifact(afterListings),
      });
      Object.assign(progress, decision.next);
      const usageLine = result.usage ? formatUsageLine(result.usage, result.model) : undefined;
      progress.lastUsage = usageLine || progress.lastUsage;
      progress.lastModel = result.model ?? progress.lastModel;
      progress.lastWorking = liveStatusLine({
        agent,
        elapsedMs: progress.lastElapsedMs ?? 0,
        latestTool: result.toolPreviews?.at(-1) ?? result.tools?.at(-1),
        turns: result.turns,
        usage: usageLine,
        running: false,
        workStream: fingerprint.workStream,
      });
      persistProgress(options.host, progress);

      const text = await formatWorkerReply(result, scratchDir);
      const details = {
        agent,
        scratchDir,
        task,
        exitCode: result.exitCode,
        aborted: result.aborted,
        errorMessage: result.errorMessage,
        stopReason: result.stopReason,
        elapsedMs: result.elapsedMs,
        timeoutMs,
        tools: result.toolPreviews ?? result.tools,
        latestTool: result.toolPreviews?.at(-1) ?? result.tools?.at(-1),
        turns: result.turns,
        model: result.model,
        usage: usageLine,
        workStream: fingerprint.workStream,
        output: digestText(result.text),
        evaluation: decision.evaluation,
      };

      if (decision.halt) {
        ctx?.ui.notify(formatHaltMessage(progress, STAGNATION_CHOICES), "warning");
        if (workerIsError(result)) {
          recordParentTool(options, SUBAGENT_TOOL_NAME, text);
          throw new SubagentFailure(`${text}\n\n${formatHaltMessage(progress, STAGNATION_CHOICES)}`, {
            ...details,
            halt: true,
          });
        }
        const recovered = await askRecovery(ctx, progress);
        Object.assign(progress, recovered);
        persistProgress(options.host, progress);
        const latest = progress.revisions.at(-1);
        if (latest) await recordPlanRevision(options, latest);
        return finish(
          options,
          SUBAGENT_TOOL_NAME,
          haltResult(`${text}\n\n${formatHaltMessage(progress, STAGNATION_CHOICES)}`, {
            ...details,
            halt: true,
          }),
        );
      }

      if (workerIsError(result)) {
        recordParentTool(options, SUBAGENT_TOOL_NAME, text);
        throw new SubagentFailure(text, details);
      }
      return finish(options, SUBAGENT_TOOL_NAME, textResult(text, details));
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
      const scratchDir = await ensureScratch(resolveGoalId(options.goalId), options.root);
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
      const scratchDir = await ensureScratch(resolveGoalId(options.goalId), options.root);
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
      const scratchDir = await ensureScratch(resolveGoalId(options.goalId), options.root);
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
  options.host = pi;
  options.progress ??= emptyProgressState();
  const worker = subagentTool(options);
  pi.registerTool(worker);
  for (const tool of [scratchWriteTool(options), scratchLsTool(options), scratchReadTool(options)]) {
    pi.registerTool(withToolView(tool));
  }

  pi.on("session_start", (_event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    const restored = reconstructProgress(ctx?.sessionManager?.getEntries?.() ?? []);
    Object.assign(options.progress ?? (options.progress = emptyProgressState()), restored);
    if (restored.lastWorking) {
      ctx?.ui.setStatus?.("subagent", restored.lastWorking);
    }
  });

  pi.on("tool_result", (event: unknown) => {
    const payload = event as {
      toolName?: string;
      result?: { details?: { halt?: boolean; aborted?: boolean; exitCode?: number; error?: string } };
    };
    if (payload.toolName !== SUBAGENT_TOOL_NAME) return undefined;
    const details = payload.result?.details;
    if (!details) return undefined;
    if (details.halt || details.aborted || details.error || (typeof details.exitCode === "number" && details.exitCode !== 0)) {
      return { isError: true };
    }
    return undefined;
  });

  return [...PARENT_TOOL_NAMES];
}
