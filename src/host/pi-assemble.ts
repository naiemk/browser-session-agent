/**
 * Host-owned harvest file assembly.
 *
 * The parent emitting a CSV as a tool argument after a long session is how
 * OpenRouter idle-timeouts the write. Notes are already on disk (remember →
 * facts.json). Magpie runs coder the same way it runs /coach after scout.
 */

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { coreRoot, goalPaths } from "../core/paths.ts";
import { listScratchFiles } from "../core/scratch.ts";
import type { ExtensionAPI, ExtensionContext } from "../pi-api.ts";
import { deliverableNameFromStep } from "./pi-plan-todos.ts";
import { resolveGoalId, type GoalIdRef } from "./pi-session-goal.ts";
import {
  ensureScratch,
  FACTS_FILE,
  syncRememberedFactsToScratch,
  withScratchInventory,
  type SubagentRuntime,
} from "./pi-subagent/bind.ts";
import {
  formatDurationMs,
  resolveTimeoutMs,
  runWorker,
  type ExtendRequest,
  type WorkerResult,
} from "./pi-subagent/spawn.ts";
import { operatorCanConfirm } from "./pi-subagent/unattended.ts";

export const ASSEMBLE_CHECKPOINT_ENTRY = "assemble-checkpoint";

export interface AssembleSpec {
  step: number;
  text: string;
}

export interface AssembleCheckpointData {
  at: string;
  file: string;
  bytes: number;
  step: number;
}

export interface PlanExecuteAssemble {
  enabled(): boolean;
  hasDeliverable(spec: AssembleSpec): Promise<boolean>;
  startAssemble(ctx: ExtensionContext, spec: AssembleSpec): Promise<boolean>;
  onDeliverable(handler: (ctx: ExtensionContext, file: string) => void): void;
}

export interface AssembleBindOptions {
  goalId: GoalIdRef;
  root?: string;
  runtime?: SubagentRuntime;
}

export function assembleCoderTask(spec: AssembleSpec, fileName: string): string {
  return [
    `Assemble ${fileName} from this scratch directory.`,
    `Remembered harvest notes are in ${FACTS_FILE} (and any other notes already here).`,
    `Plan step: ${spec.text}`,
    `Write ${fileName} here. Quote CSV fields that contain commas. Do not invent rows that are not in the notes.`,
    `Empty addresses get one row each when the notes say the address was empty.`,
    `Set fetched_at from the system date (date +%Y-%m-%d), not from chat.`,
    `Do not browse. This is file assembly only.`,
  ].join("\n");
}

export function listingHasDeliverable(
  listings: ReadonlyArray<{ name: string; bytes: number }>,
  fileName: string,
): boolean {
  const want = fileName.toLowerCase();
  return listings.some((item) => {
    if (item.bytes <= 0) return false;
    const base = item.name.split("/").pop()?.toLowerCase();
    return item.name.toLowerCase() === want || base === want;
  });
}

function restoreCheckpoint(
  entries: ReadonlyArray<{ customType?: string; data?: unknown }>,
): AssembleCheckpointData | undefined {
  const found = [...entries].reverse().find((entry) => entry.customType === ASSEMBLE_CHECKPOINT_ENTRY);
  const data = found?.data;
  if (!data || typeof data !== "object") return undefined;
  const record = data as Partial<AssembleCheckpointData>;
  if (typeof record.file !== "string" || typeof record.at !== "string") return undefined;
  return {
    at: record.at,
    file: record.file,
    bytes: Number(record.bytes) || 0,
    step: Number(record.step) || 0,
  };
}

function defaultRuntime(options: AssembleBindOptions): SubagentRuntime {
  return {
    run(input) {
      return runWorker({
        ...input,
        goalId: resolveGoalId(options.goalId),
        modelsRoot: options.root,
      });
    },
  };
}

function confirmExtend(ctx: ExtensionContext | undefined) {
  return async (request: ExtendRequest): Promise<boolean> => {
    if (!operatorCanConfirm(ctx)) return request.alive !== false;
    if (request.alive === false) return false;
    if (!ctx?.ui?.confirm) return false;
    return ctx.ui.confirm(
      "Allow a longer coder run?",
      `Assembling harvest file. ${formatDurationMs(request.elapsedMs)} so far.`,
    );
  };
}

export function bindAssemble(pi: ExtensionAPI, options: AssembleBindOptions): PlanExecuteAssemble {
  const runtime = options.runtime ?? defaultRuntime(options);
  let assembling = false;
  let latest: AssembleCheckpointData | undefined;
  let listener: ((ctx: ExtensionContext, file: string) => void) | undefined;

  function persist(data: AssembleCheckpointData): void {
    latest = data;
    pi.appendEntry?.(ASSEMBLE_CHECKPOINT_ENTRY, data);
  }

  async function listingsFor(spec: AssembleSpec) {
    const goalId = resolveGoalId(options.goalId);
    await syncRememberedFactsToScratch(goalId, options.root);
    const scratchDir = await ensureScratch(goalId, options.root);
    return { scratchDir, listings: await listScratchFiles(scratchDir), fileName: deliverableNameFromStep(spec.text) };
  }

  async function hasDeliverable(spec: AssembleSpec): Promise<boolean> {
    if (latest && latest.bytes > 0) return true;
    const { listings, fileName } = await listingsFor(spec);
    return listingHasDeliverable(listings, fileName);
  }

  async function startAssemble(ctx: ExtensionContext, spec: AssembleSpec): Promise<boolean> {
    if (assembling) return false;
    const { scratchDir, listings, fileName } = await listingsFor(spec);
    if (listingHasDeliverable(listings, fileName)) {
      const hit = listings.find((item) => listingHasDeliverable([item], fileName));
      persist({
        at: new Date().toISOString(),
        file: fileName,
        bytes: hit?.bytes ?? 0,
        step: spec.step,
      });
      listener?.(ctx, fileName);
      return true;
    }

    assembling = true;
    const task = assembleCoderTask(spec, fileName);
    const timeoutMs = resolveTimeoutMs();
    ctx.ui.notify(`Assembling ${fileName} from remembered notes.`);
    ctx.ui.setWorkingMessage?.(`coder · assembling ${fileName}`);
    pi.sendMessage?.(
      {
        customType: "plan-assemble",
        content: `Assembling ${fileName} from remembered notes. Magpie runs coder; do not paste the file in this session.`,
        display: true,
      },
      { triggerTurn: false },
    );

    let result: WorkerResult;
    try {
      result = await runtime.run({
        agentName: "coder",
        task: withScratchInventory(task, listings),
        scratchDir,
        timeoutMs,
        confirmExtend: confirmExtend(ctx),
      });
    } catch (error) {
      assembling = false;
      ctx.ui.setWorkingMessage?.();
      ctx.ui.notify(
        `Harvest file assembly failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return false;
    }

    const after = await listScratchFiles(scratchDir);
    const hit = after.find((item) => listingHasDeliverable([item], fileName));
    assembling = false;
    ctx.ui.setWorkingMessage?.();

    if (!hit) {
      ctx.ui.notify(
        result.errorMessage?.trim() ||
          result.stderr.trim() ||
          `Coder did not write ${fileName}.`,
        "error",
      );
      return false;
    }

    const paths = goalPaths(coreRoot(options.root), resolveGoalId(options.goalId));
    await mkdir(paths.artifactsDir, { recursive: true });
    await copyFile(path.join(scratchDir, hit.name), path.join(paths.artifactsDir, fileName)).catch(() => undefined);

    persist({
      at: new Date().toISOString(),
      file: fileName,
      bytes: hit.bytes,
      step: spec.step,
    });
    ctx.ui.notify(`Wrote ${fileName} (${hit.bytes} bytes).`);
    listener?.(ctx, fileName);
    return true;
  }

  pi.on("session_start", (_event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    latest = restoreCheckpoint(ctx?.sessionManager?.getEntries?.() ?? []) ?? latest;
  });

  return {
    enabled: () => assembling,
    hasDeliverable,
    startAssemble,
    onDeliverable(handler) {
      listener = handler;
    },
  };
}
