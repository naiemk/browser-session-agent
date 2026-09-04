/**
 * Turning records into the handful of numbers that decide something.
 *
 * The headline is attribution: what share of the context each payload type accounts for.
 * Knowing a run cost 40,000 tokens tells you nothing actionable; knowing that most of it
 * was stale action snapshots tells you exactly what to change.
 *
 * Everything here is derived rather than recorded, so a new question can be asked of runs
 * that already happened. Duplicate detection in particular is analysis, not measurement:
 * the records carry hashes and the grouping happens here.
 */

import type { LedgerEvent } from "../core/ledger.ts";
import type {
  ContextRecord,
  MetricRecord,
  ObservationRecord,
  RunRecord,
  ToolResultRecord,
  TurnRecord,
} from "../runtime/metrics.ts";

export interface TokenSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  costUsd: number;
  /**
   * Cache reads over all prompt tokens. Low means the prefix keeps changing, and since a
   * cache read is billed at a fraction of fresh input, that is usually where the money
   * went rather than anywhere in the payloads.
   */
  cacheReadShare: number;
}

export interface Attribution {
  source: string;
  bytes: number;
  share: number;
}

export interface DuplicateWork {
  /** Results identical to an earlier result from the same tool. */
  repeatedResults: number;
  repeatedResultBytes: number;
  /** Reads whose snapshot was byte-identical to the previous read of the same page. */
  zeroChangeObservations: number;
  /** The same URL loaded more than once, from the ledger. */
  repeatNavigations: number;
  /** Probes issued with a query that had already been answered. */
  repeatProbes: number;
}

export interface Rollup {
  goalId?: string;
  model?: string;
  turns: number;
  tokens: TokenSummary;
  contextBytes: { mean: number; peak: number; final: number };
  /** Per-turn overhead that is resent verbatim whether it is read or not. */
  fixedOverheadBytes: { card: number; toolSchemas: number; tools: number };
  attribution: Attribution[];
  duplicates: DuplicateWork;
  /**
   * How often pruning rewrote a message the provider had already seen. A low mean index
   * across many turns means the prompt cache is being invalidated every turn.
   */
  cache: { turnsWithRewrite: number; meanRewrittenFrom: number };
  observations: { count: number; meanBytes: number; withCollisions: number; maxCollisions: number };
}

function share(part: number, whole: number): number {
  return whole > 0 ? round(part / whole) : 0;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : round(values.reduce((a, b) => a + b, 0) / values.length, 1);
}

export interface RollupInput {
  records: readonly MetricRecord[];
  /** Optional, for the questions the ledger answers better: repeat visits and probes. */
  events?: readonly LedgerEvent[];
  goalId?: string;
}

export function rollup(input: RollupInput): Rollup {
  const runs = input.records.filter((r): r is RunRecord => r.kind === "run");
  const turnRecords = input.records.filter((r): r is TurnRecord => r.kind === "turn");
  const contexts = input.records.filter((r): r is ContextRecord => r.kind === "context");
  const results = input.records.filter((r): r is ToolResultRecord => r.kind === "tool_result");
  const observations = input.records.filter((r): r is ObservationRecord => r.kind === "observation");

  const totals = turnRecords.reduce(
    (acc, turn) => ({
      input: acc.input + turn.inputTokens,
      output: acc.output + turn.outputTokens,
      cacheRead: acc.cacheRead + turn.cacheReadTokens,
      cacheWrite: acc.cacheWrite + turn.cacheWriteTokens,
      costUsd: acc.costUsd + turn.costUsd,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
  );
  const promptTokens = totals.input + totals.cacheRead;

  // Tool results are attributed by tool; the card and schemas are counted once per turn
  // because that is how often they are sent.
  const byTool = new Map<string, number>();
  for (const result of results) {
    byTool.set(result.tool, (byTool.get(result.tool) ?? 0) + result.bytes);
  }
  const run = runs[0];
  const turnCount = Math.max(contexts.length, turnRecords.length);
  const cardTotal = (run?.cardBytes ?? 0) * turnCount;
  const schemaTotal = (run?.toolSchemaBytes ?? 0) * turnCount;

  const attributedTotal = cardTotal + schemaTotal + [...byTool.values()].reduce((a, b) => a + b, 0);
  const attribution: Attribution[] = [
    { source: "card", bytes: cardTotal, share: share(cardTotal, attributedTotal) },
    { source: "toolSchemas", bytes: schemaTotal, share: share(schemaTotal, attributedTotal) },
    ...[...byTool.entries()].map(([tool, bytes]) => ({
      source: `tool:${tool}`,
      bytes,
      share: share(bytes, attributedTotal),
    })),
  ].sort((a, b) => b.bytes - a.bytes);

  return {
    goalId: input.goalId,
    model: run?.model,
    turns: turnCount,
    tokens: {
      input: totals.input,
      output: totals.output,
      cacheRead: totals.cacheRead,
      cacheWrite: totals.cacheWrite,
      total: totals.input + totals.output + totals.cacheRead,
      costUsd: round(totals.costUsd, 6),
      cacheReadShare: share(totals.cacheRead, promptTokens),
    },
    contextBytes: {
      mean: mean(contexts.map((c) => c.bytes)),
      peak: Math.max(0, ...contexts.map((c) => c.bytes)),
      final: contexts[contexts.length - 1]?.bytes ?? 0,
    },
    fixedOverheadBytes: {
      card: run?.cardBytes ?? 0,
      toolSchemas: run?.toolSchemaBytes ?? 0,
      tools: run?.toolCount ?? 0,
    },
    attribution,
    duplicates: duplicateWork(results, observations, input.events ?? []),
    cache: cacheHealth(contexts),
    observations: {
      count: observations.length,
      meanBytes: mean(observations.map((o) => o.bytes)),
      withCollisions: observations.filter((o) => o.keyCollisions > 0).length,
      maxCollisions: Math.max(0, ...observations.map((o) => o.keyCollisions)),
    },
  };
}

function duplicateWork(
  results: readonly ToolResultRecord[],
  observations: readonly ObservationRecord[],
  events: readonly LedgerEvent[],
): DuplicateWork {
  const seen = new Set<string>();
  let repeatedResults = 0;
  let repeatedResultBytes = 0;
  for (const result of results) {
    const key = `${result.tool}|${result.hash}`;
    if (seen.has(key)) {
      repeatedResults += 1;
      repeatedResultBytes += result.bytes;
    }
    seen.add(key);
  }

  // Consecutive reads of the same page that returned the same bytes bought nothing.
  let zeroChangeObservations = 0;
  const lastByUrl = new Map<string, string>();
  for (const observation of observations) {
    if (lastByUrl.get(observation.url) === observation.hash) zeroChangeObservations += 1;
    lastByUrl.set(observation.url, observation.hash);
  }

  const visited = new Set<string>();
  let repeatNavigations = 0;
  const probed = new Set<string>();
  let repeatProbes = 0;
  for (const event of events) {
    const url = event.action?.url;
    if (url) {
      if (visited.has(url)) repeatNavigations += 1;
      visited.add(url);
    }
    if (event.type === "probe" && event.payload?.query) {
      const key = JSON.stringify(event.payload.query);
      if (probed.has(key)) repeatProbes += 1;
      probed.add(key);
    }
  }

  return {
    repeatedResults,
    repeatedResultBytes,
    zeroChangeObservations,
    repeatNavigations,
    repeatProbes,
  };
}

function cacheHealth(contexts: readonly ContextRecord[]): Rollup["cache"] {
  const rewritten = contexts.filter((c) => c.rewrittenFrom >= 0);
  return {
    turnsWithRewrite: rewritten.length,
    meanRewrittenFrom: mean(rewritten.map((c) => c.rewrittenFrom)),
  };
}

/**
 * Many runs reduced to per-task means, so a suite of 26 tasks compares with a suite of 4.
 *
 * Token fields are optional because a token-free run cannot produce them, and reporting a
 * zero would read as an improvement.
 */
export interface OptimizeSummary {
  tasks: number;
  turnsPerTask: number;
  contextBytesPerTask: number;
  toolResultBytesPerTask: number;
  observationsPerTask: number;
  observationBytesPerTask: number;
  duplicateResultsPerTask: number;
  zeroChangeObservationsPerTask: number;
  repeatNavigationsPerTask: number;
  snapshotsWithCollisionsPerTask: number;
  cardBytes: number;
  toolSchemaBytes: number;
  toolCount: number;
  tokensPerTask?: number;
  costPerTask?: number;
  cacheReadShare?: number;
  /** Bytes by payload type, summed across tasks. This is what explains a change. */
  attribution: Attribution[];
}

export function summarize(rollups: readonly Rollup[]): OptimizeSummary {
  const tasks = Math.max(rollups.length, 1);
  const per = (total: number) => round(total / tasks, 1);
  const sum = (pick: (value: Rollup) => number) =>
    rollups.reduce((total, value) => total + pick(value), 0);

  const bySource = new Map<string, number>();
  for (const value of rollups) {
    for (const entry of value.attribution) {
      bySource.set(entry.source, (bySource.get(entry.source) ?? 0) + entry.bytes);
    }
  }
  const attributedTotal = [...bySource.values()].reduce((a, b) => a + b, 0);

  const tokens = sum((value) => value.tokens.total);
  const promptTokens = sum((value) => value.tokens.input + value.tokens.cacheRead);
  const cacheRead = sum((value) => value.tokens.cacheRead);

  return {
    tasks: rollups.length,
    turnsPerTask: per(sum((value) => value.turns)),
    contextBytesPerTask: per(sum((value) => value.contextBytes.mean)),
    toolResultBytesPerTask: per(
      sum((value) =>
        value.attribution
          .filter((entry) => entry.source.startsWith("tool:"))
          .reduce((total, entry) => total + entry.bytes, 0),
      ),
    ),
    observationsPerTask: per(sum((value) => value.observations.count)),
    observationBytesPerTask: per(
      sum((value) => value.observations.count * value.observations.meanBytes),
    ),
    duplicateResultsPerTask: per(sum((value) => value.duplicates.repeatedResults)),
    zeroChangeObservationsPerTask: per(sum((value) => value.duplicates.zeroChangeObservations)),
    repeatNavigationsPerTask: per(sum((value) => value.duplicates.repeatNavigations)),
    snapshotsWithCollisionsPerTask: per(sum((value) => value.observations.withCollisions)),
    cardBytes: rollups[0]?.fixedOverheadBytes.card ?? 0,
    toolSchemaBytes: rollups[0]?.fixedOverheadBytes.toolSchemas ?? 0,
    toolCount: rollups[0]?.fixedOverheadBytes.tools ?? 0,
    ...(tokens > 0
      ? {
          tokensPerTask: per(tokens),
          costPerTask: round(sum((value) => value.tokens.costUsd) / tasks, 6),
          cacheReadShare: share(cacheRead, promptTokens),
        }
      : {}),
    attribution: [...bySource.entries()]
      .map(([source, bytes]) => ({ source, bytes, share: share(bytes, attributedTotal) }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

export function formatRollup(value: Rollup): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  lines.push(`${value.goalId ?? "run"} — ${value.model ?? "unknown model"}, ${value.turns} turns`);
  lines.push("");
  lines.push(
    `tokens: ${value.tokens.total} total (${value.tokens.input} fresh input, ` +
      `${value.tokens.cacheRead} cache read, ${value.tokens.output} output), ` +
      `$${value.tokens.costUsd.toFixed(6)}`,
  );
  if (value.tokens.total > 0) {
    lines.push(`cache reads as a share of prompt tokens: ${pct(value.tokens.cacheReadShare)}`);
  }
  lines.push(
    `context bytes: ${value.contextBytes.mean} mean, ${value.contextBytes.peak} peak, ` +
      `${value.contextBytes.final} final`,
  );
  lines.push(
    `resent every turn: ${value.fixedOverheadBytes.card} B card, ` +
      `${value.fixedOverheadBytes.toolSchemas} B of schemas for ${value.fixedOverheadBytes.tools} tools`,
  );

  lines.push("");
  lines.push("where the bytes went:");
  for (const entry of value.attribution) {
    if (entry.bytes === 0) continue;
    lines.push(`  ${pct(entry.share).padStart(6)}  ${String(entry.bytes).padStart(8)} B  ${entry.source}`);
  }

  lines.push("");
  lines.push("duplicate work:");
  lines.push(
    `  ${value.duplicates.repeatedResults} identical tool results ` +
      `(${value.duplicates.repeatedResultBytes} B)`,
  );
  lines.push(`  ${value.duplicates.zeroChangeObservations} reads that returned the same page`);
  lines.push(`  ${value.duplicates.repeatNavigations} repeat navigations`);
  lines.push(`  ${value.duplicates.repeatProbes} repeated probe queries`);

  lines.push("");
  lines.push(
    `prompt cache: ${value.cache.turnsWithRewrite} of ${value.turns} turns rewrote history, ` +
      `earliest rewrite at index ${value.cache.meanRewrittenFrom} on average`,
  );
  if (value.cache.turnsWithRewrite >= value.turns && value.turns > 2) {
    lines.push("  every turn rewrote the prefix, so the provider cache cannot be hit");
  }
  if (value.observations.withCollisions > 0) {
    lines.push("");
    lines.push(
      `${value.observations.withCollisions} of ${value.observations.count} snapshots had ` +
        `controls sharing a role and name (up to ${value.observations.maxCollisions}), ` +
        "which the page delta cannot tell apart",
    );
  }

  return lines.join("\n");
}
