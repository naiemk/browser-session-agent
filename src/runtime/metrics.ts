/**
 * What a run reports about its own cost.
 *
 * This is the emit side only: record shapes and a sink interface. The concrete writers,
 * the rollup, and the regression comparison live in `src/optimize`, which depends on the
 * runtime and never the other way round. Keeping the port here is deliberate — a hot
 * path that imported a directory named "optimize" would invite being treated as
 * optional, and metering that can be quietly dropped is metering nobody trusts.
 *
 * Records carry facts, not conclusions. Duplicate detection, attribution, and cache-hit
 * ratios are all derived by the rollup, so adding a new question later does not mean
 * re-running anything.
 */

import { createHash } from "node:crypto";
import type { WireObservation } from "./wire.ts";

/** Emitted once per run: the overhead that is resent on every single turn. */
export interface RunRecord {
  kind: "run";
  at: string;
  model: string;
  /** The system prompt. Billed once per turn, so its size matters more than it looks. */
  cardBytes: number;
  /** Serialized tool schemas, also resent every turn. */
  toolSchemaBytes: number;
  toolCount: number;
  maxTurns: number;
}

/** Provider usage for one assistant message, kept split because the split is the point. */
export interface TurnRecord {
  kind: "turn";
  turn: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

/**
 * The context handed to the model for one turn.
 *
 * `rewrittenFrom` is the index of the earliest message whose content changed this turn,
 * or -1 when nothing was rewritten. Providers cache on an exact prefix, so a small index
 * here every turn means pruning is invalidating the cache and converting cheap cache
 * reads into full-price input — which would make pruning a net loss.
 */
export interface ContextRecord {
  kind: "context";
  turn: number;
  bytes: number;
  liveBytes: number;
  placeholderBytes: number;
  messages: number;
  rewrittenFrom: number;
}

export interface ToolResultRecord {
  kind: "tool_result";
  turn: number;
  tool: string;
  bytes: number;
  /** Identical hash for the same tool means the same answer was bought twice. */
  hash: string;
}

/** Snapshot-specific facts, recorded whenever a tool result carries one. */
export interface ObservationRecord {
  kind: "observation";
  turn: number;
  tool: string;
  url: string;
  controls: number;
  bytes: number;
  changes: number;
  /** Unchanged hash between consecutive reads means the read bought no information. */
  hash: string;
  /** Controls sharing a role:name with a sibling, which is what breaks the delta. */
  keyCollisions: number;
}

export type MetricRecord =
  | RunRecord
  | TurnRecord
  | ContextRecord
  | ToolResultRecord
  | ObservationRecord;

/**
 * Where records go. The runtime holds one of these and never asks what it is, so
 * metering can be a file, a buffer, or nothing at all.
 */
export interface MetricsSink {
  record(record: MetricRecord): void;
  flush(): Promise<void>;
}

/** The default: metering costs nothing when nobody asked for it. */
export const NO_METRICS: MetricsSink = {
  record() {},
  async flush() {},
};

/**
 * One tool result, exactly as the model received it.
 *
 * This exists so the screen can stop being the log. A snapshot printed in full is
 * unreadable on a terminal and unsearchable afterwards, but it is the only record of
 * what the model was actually reasoning from, so it cannot simply be dropped. Keeping
 * the bytes here means the terminal can show one line and lose nothing.
 *
 * `hash` is the same hash as the matching `ToolResultRecord`, which is what lets a line
 * on screen, its cost, and its full text be joined without a shared id being threaded
 * through everything.
 */
export interface PayloadRecord {
  at: string;
  turn: number;
  tool: string;
  bytes: number;
  hash: string;
  text: string;
}

export interface PayloadSink {
  write(record: PayloadRecord): void;
  flush(): Promise<void>;
}

export const NO_PAYLOADS: PayloadSink = {
  write() {},
  async flush() {},
};

/** Short and stable. Collisions do not matter: this compares payloads, not secrets. */
export function hashOf(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

export function observationStats(observation: WireObservation): {
  url: string;
  controls: number;
  changes: number;
  keyCollisions: number;
} {
  const seen = new Map<string, number>();
  for (const control of observation.controls) {
    const key = `${control.role}:${control.name}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let keyCollisions = 0;
  for (const count of seen.values()) {
    if (count > 1) keyCollisions += count;
  }

  return {
    url: observation.url,
    controls: observation.controls.length,
    changes: observation.changes?.length ?? 0,
    keyCollisions,
  };
}
