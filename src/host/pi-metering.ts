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

export interface SessionOverhead {
  goalId: string;
  cardBytes: number;
  toolSchemaBytes: number;
  toolCount: number;
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

/** Bytes of a message as the provider would see it, which is close enough for a trend. */
function messageBytes(message: unknown): number {
  try {
    return JSON.stringify(message).length;
  } catch {
    return 0;
  }
}

export function meterPiSession(
  pi: ExtensionAPI,
  evidence: Evidence,
  overhead: SessionOverhead,
): void {
  let turn = 0;
  let recordedRun = false;
  // Hashes of each message's content, so a rewrite is visible as a changed prefix.
  let previous: number[] = [];

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
      maxTurns: 0,
    });
  };

  pi.on("context", (event: unknown) => {
    const messages = (event as { messages?: unknown })?.messages;
    if (!Array.isArray(messages)) return;

    const sizes = messages.map((message) => messageBytes(message));
    /*
     * Where the prompt stopped matching the last one.
     *
     * Providers cache on an exact prefix, so if this index is small every turn then
     * something upstream is rewriting history and turning cheap cache reads into
     * full-price input. That would make pruning a net loss, and it is invisible without
     * this number.
     */
    let rewrittenFrom = -1;
    for (let at = 0; at < Math.min(sizes.length, previous.length); at += 1) {
      if (sizes[at] !== previous[at]) {
        rewrittenFrom = at;
        break;
      }
    }
    previous = sizes;

    const bytes = sizes.reduce((total, size) => total + size, 0);
    evidence.metrics.record({
      kind: "context",
      turn,
      bytes,
      liveBytes: bytes,
      placeholderBytes: 0,
      messages: messages.length,
      rewrittenFrom,
    });
  });

  pi.on("turn_end", (event: unknown) => {
    const message = (event as { message?: unknown })?.message;
    turn = num((event as { turnIndex?: unknown })?.turnIndex) || turn + 1;
    recordRun(modelOf(message));

    const usage = usageOf(message);
    if (!usage) return;
    const cost = usage.cost as Record<string, unknown> | undefined;
    evidence.metrics.record({
      kind: "turn",
      turn,
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
