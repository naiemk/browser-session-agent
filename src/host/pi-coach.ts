/**
 * Interactive `/coach`: review-phase digest in, strategy artifact out (COACH-09, 12–13, 15–18).
 *
 * Does not invent a model router (D12). The operator may Ctrl+P to a stronger class.
 */

import { coreRoot, goalPaths } from "../core/paths.ts";
import type { Evidence } from "../runtime/evidence.ts";
import { compileDigest, type CompiledDigest } from "../runtime/coach/digest.ts";
import {
  assertStrategyArtifact,
  renderStrategyArtifact,
  StrategyArtifactError,
  type StrategyArtifact,
} from "../runtime/coach/strategy.ts";
import { readMetrics } from "../optimize/recorder.ts";
import type { CustomSessionMessage, ExtensionAPI, ExtensionContext } from "../pi-api.ts";
import { capabilityCoordinator } from "./pi-capabilities.ts";
import { PLAN_MODE_DISABLED_TOOLS } from "./pi-plan-mode.ts";
import { assistantText, isAssistantMessage } from "./pi-plan-todos.ts";

export const COACH_COMMAND = "coach";
export const COACH_CHECKPOINT_ENTRY = "coach-checkpoint";
export const COACH_CONTEXT_TYPE = "coach-review-context";

export const COACH_DISABLED_TOOLS = PLAN_MODE_DISABLED_TOOLS;

const COACH_INSTRUCTIONS =
  "[COACH REVIEW]\n" +
  "Phase: review. Mutations are off. Output one JSON strategy artifact only (schemaVersion 1). " +
  "Do not rewrite qualification criteria, grants, send, or follow policy. Do not skip approval. " +
  "Coach is a guideline generator, not a second planner.\n" +
  "This session's model is unchanged. The operator can Ctrl+P to pick a stronger class for this turn.\n\n" +
  "Trajectory digest (not the session transcript):\n";

export interface CoachCheckpointData {
  at: string;
  artifact: StrategyArtifact;
  rendered: string;
  digestBytes: number;
  artifactBytes: number;
  phase: "review";
  replacedPrevious?: boolean;
}

export interface CoachHandle {
  enabled(): boolean;
  injection(): string | undefined;
  hasArtifact(): boolean;
  startReview(ctx: ExtensionContext): Promise<boolean>;
  onArtifact(handler: (ctx: ExtensionContext) => void): void;
}

export interface CoachBindOptions {
  evidence: Evidence;
  objective: string;
  criteria?: readonly string[];
}

function restoreCheckpoint(
  entries: ReadonlyArray<{ customType?: string; data?: unknown }>,
): CoachCheckpointData | undefined {
  const found = [...entries].reverse().find((entry) => entry.customType === COACH_CHECKPOINT_ENTRY);
  const data = found?.data;
  if (!data || typeof data !== "object") return undefined;
  const record = data as Partial<CoachCheckpointData>;
  if (!record.artifact || !record.rendered || !record.at) return undefined;
  return record as CoachCheckpointData;
}

async function compileSessionDigest(
  options: CoachBindOptions,
  checkpoint?: CoachCheckpointData,
): Promise<CompiledDigest> {
  const events = (await options.evidence.ledger.read?.()) ?? [];
  await options.evidence.metrics.flush();
  let metrics: Awaited<ReturnType<typeof readMetrics>> = [];
  const goalId = options.evidence.goal?.goalId;
  const root = options.evidence.goal?.root ?? coreRoot();
  if (goalId) {
    metrics = await readMetrics(goalPaths(root, goalId).metricsFile);
  }
  return compileDigest({
    events,
    metrics,
    goalText: options.objective,
    criteria: [...(options.criteria ?? [])],
    checkpoint: checkpoint ? { at: checkpoint.at } : undefined,
    previousArtifact: checkpoint
      ? { summary: checkpoint.artifact.summary, followed: true }
      : undefined,
  });
}

export function bindCoach(pi: ExtensionAPI, options: CoachBindOptions): CoachHandle {
  const capabilities = capabilityCoordinator(pi);
  let reviewing = false;
  let digestJson = "";
  let latest: CoachCheckpointData | undefined;
  let artifactListener: ((ctx: ExtensionContext) => void) | undefined;

  function persist(data: CoachCheckpointData): void {
    latest = data;
    pi.appendEntry?.(COACH_CHECKPOINT_ENTRY, data);
  }

  function enableReview(ctx: ExtensionContext): void {
    reviewing = true;
    capabilities.constrain("coach", { disable: COACH_DISABLED_TOOLS });
    ctx.ui.setStatus?.("coach", "coach review");
  }

  function disableReview(ctx: ExtensionContext, notify = false): void {
    reviewing = false;
    digestJson = "";
    capabilities.release("coach");
    ctx.ui.setStatus?.("coach", latest ? "coached" : undefined);
    if (notify) ctx.ui.notify("Coach review ended. Browser tools restored.");
  }

  function injection(): string | undefined {
    if (reviewing && digestJson) {
      return `${COACH_INSTRUCTIONS}${digestJson}`;
    }
    if (!latest) return undefined;
    const swap = latest.replacedPrevious
      ? "\nA new guideline replaces the previous one. Finish the current entity before switching loops.\n"
      : "\n";
    return `${latest.rendered}${swap}`;
  }

  async function handleCoach(_args: string, ctx: ExtensionContext): Promise<boolean> {
    if (reviewing) {
      ctx.ui.notify("Coach review is already running.");
      return false;
    }
    const previous = latest;
    let compiled: CompiledDigest;
    try {
      compiled = await compileSessionDigest(options, previous);
    } catch (error) {
      ctx.ui.notify(`Could not compile digest: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    }
    digestJson = compiled.json;
    enableReview(ctx);
    ctx.ui.notify(
      "Coach review: mutations off. Digest only — not the transcript. Ctrl+P if you want a stronger class.",
    );
    const content = `${COACH_INSTRUCTIONS}${compiled.json}`;
    if (pi.sendUserMessage) {
      pi.sendUserMessage(content, { deliverAs: "followUp" });
    } else {
      ctx.ui.notify("Coach review on. Send the digest as the next message.");
    }
    return true;
  }

  async function acceptArtifact(text: string, ctx: ExtensionContext): Promise<boolean> {
    if (!reviewing) return false;
    try {
      const artifact = assertStrategyArtifact(text);
      const rendered = renderStrategyArtifact(artifact);
      persist({
        at: new Date().toISOString(),
        artifact,
        rendered,
        digestBytes: digestJson.length,
        artifactBytes: JSON.stringify(artifact).length,
        phase: "review",
        replacedPrevious: Boolean(latest),
      });
      await options.evidence.facts.mergeGoalFacts({ strategyArtifact: artifact });
      disableReview(ctx);
      pi.sendMessage?.(
        {
          customType: "coach-artifact",
          content: rendered,
          display: true,
        },
        { triggerTurn: false },
      );
      ctx.ui.notify("Strategy artifact saved. Harvest sees the guideline, not the digest.");
      artifactListener?.(ctx);
      return true;
    } catch (error) {
      if (error instanceof StrategyArtifactError) {
        ctx.ui.notify(`Coach output rejected (${error.code}): ${error.message}`, "warning");
        return false;
      }
      throw error;
    }
  }

  pi.registerCommand(COACH_COMMAND, {
    description: "Review-phase coach: digest in, strategy guideline out (mutations off)",
    handler: async (args, ctx) => {
      await handleCoach(args, ctx);
    },
  });

  pi.on("context", (_event: unknown) => {
    if (!reviewing || !digestJson) return undefined;
    return {
      messages: [{ role: "user", content: `${COACH_INSTRUCTIONS}${digestJson}` }],
    };
  });

  pi.on("before_agent_start", () => {
    const content = injection();
    if (!content) return undefined;
    return {
      message: {
        customType: reviewing ? COACH_CONTEXT_TYPE : "coach-harvest-context",
        content,
        display: false,
      } satisfies CustomSessionMessage,
    };
  });

  pi.on("turn_end", async (event: unknown, ctxUnknown: unknown) => {
    if (!reviewing) return;
    const message = (event as { message?: unknown })?.message;
    if (!isAssistantMessage(message)) return;
    await acceptArtifact(assistantText(message), ctxUnknown as ExtensionContext);
  });

  pi.on("agent_end", async (event: unknown, ctxUnknown: unknown) => {
    if (!reviewing) return;
    const ctx = ctxUnknown as ExtensionContext;
    const messages = Array.isArray((event as { messages?: unknown[] })?.messages)
      ? (event as { messages: unknown[] }).messages
      : [];
    const lastAssistant = [...messages].reverse().find(isAssistantMessage);
    if (lastAssistant) await acceptArtifact(assistantText(lastAssistant), ctx);
  });

  pi.on("session_start", (_event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    const restored = restoreCheckpoint(ctx?.sessionManager?.getEntries?.() ?? []);
    if (restored) latest = restored;
    reviewing = false;
    digestJson = "";
    capabilities.release("coach");
    ctx.ui.setStatus?.("coach", latest ? "coached" : undefined);
  });

  return {
    enabled: () => reviewing,
    injection,
    hasArtifact: () => Boolean(latest),
    startReview: (ctx) => handleCoach("", ctx),
    onArtifact(handler) {
      artifactListener = handler;
    },
  };
}
