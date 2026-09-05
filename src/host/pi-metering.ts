/**
 * Metering the session Pi drives.
 *
 * The suite's own loop wraps the model call, so it can count tokens on the way past. The
 * local CLI cannot: Pi owns the request. But Pi reports what happened, so the numbers
 * come from its events instead, and land in the same files the suite writes - which is
 * what lets `browser-agent metrics` read a real chat session with no new plumbing.
 *
 * Everything here is defensive about shapes. These are another package's event payloads,
 * and metering that throws inside a chat would cost the operator their session.
 */

import type { ExtensionAPI } from "../pi-api.ts";
import type { Evidence } from "../runtime/evidence.ts";
import { measureContext, type PrunableMessage } from "../runtime/prune.ts";

export interface SessionOverhead {
  goalId: string;
  cardBytes: number;
  toolSchemaBytes: number;
  toolCount: number;
  /** 0 when the host imposes no cap, which is the case for a chat. */
  maxTurns?: number;
}

/**
 * The turn every record is stamped with.
 *
 * Pi numbers turns from one again on each user message, so its index cannot join a tool
 * result to the context that carried it - which is why every `tool_result` record in the
 * first metered run said turn 0 and the payloads could only be matched to turns by
 * guessing at their order. This counts the whole session instead, and the tools read the
 * same counter, so a payload, the context it landed in, and the usage it was billed under
 * all carry one number.
 */
export interface TurnClock {
  current(): number;
  /** Called when a context is built, which is the start of a turn. */
  advance(): number;
}

export function turnClock(): TurnClock {
  let turn = 0;
  return {
    current: () => turn,
    advance: () => (turn += 1),
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageOf(message: unknown): Record<string, unknown> | undefined {
  const usage = (message as { usage?: unknown })?.usage;
  return usage && typeof usage === "object" ? (usage as Record<string, unknown>) : undefined;
}

function modelOf(message: unknown): string {
  const model = (message as { model?: unknown })?.model;
  if (typeof model === "string") return model;
  const nested = (model as { id?: unknown })?.id;
  return typeof nested === "string" ? nested : "unknown";
}

export function meterPiSession(
  pi: ExtensionAPI,
  evidence: Evidence,
  overhead: SessionOverhead,
  clock: TurnClock,
): void {
  let recordedRun = false;
  // Last turn's messages, so a rewrite is visible as a changed prefix.
  let previous: PrunableMessage[] = [];

  const recordRun = (model: string) => {
    if (recordedRun) return;
    recordedRun = true;
    evidence.metrics.record({
      kind: "run",
      at: new Date().toISOString(),
      model,
      cardBytes: overhead.cardBytes,
      toolSchemaBytes: overhead.toolSchemaBytes,
      toolCount: overhead.toolCount,
      maxTurns: overhead.maxTurns ?? 0,
    });
  };

  pi.on("context", (event: unknown) => {
    const messages = (event as { messages?: unknown })?.messages;
    if (!Array.isArray(messages)) return;
    const turn = clock.advance();

    /*
     * The same accounting the suite's loop does, against the previous turn rather than
     * against an unpruned copy of this one.
     *
     * Both answer the cache question - providers cache on an exact prefix, so the
     * earliest changed index is where the cache stops paying - but only the cross-turn
     * comparison catches a rewrite this process did not make.
     */
    const measured = measureContext(previous, messages as PrunableMessage[]);
    previous = messages as PrunableMessage[];

    evidence.metrics.record({ kind: "context", turn, ...measured, messages: messages.length });
  });

  pi.on("turn_end", (event: unknown) => {
    const message = (event as { message?: unknown })?.message;
    recordRun(modelOf(message));

    const usage = usageOf(message);
    if (!usage) return;
    const cost = usage.cost as Record<string, unknown> | undefined;
    evidence.metrics.record({
      kind: "turn",
      turn: clock.current(),
      inputTokens: num(usage.input),
      outputTokens: num(usage.output),
      cacheReadTokens: num(usage.cacheRead),
      cacheWriteTokens: num(usage.cacheWrite),
      costUsd: num(cost?.total),
    });
  });

  // A chat has no natural end, so flushing at shutdown is the only chance to catch the
  // tail. The payload log writes eagerly and needs no help.
  pi.on("session_shutdown", async () => {
    await evidence.metrics.flush();
    await evidence.payloads.flush();
  });
}
