/**
 * Explaining a change rather than blocking it.
 *
 * A bare percentage is noise people learn to ignore, and a build that fails on cost
 * teaches everyone to raise the budget. What makes a number actionable is the cause
 * attached to it: "context is up 18%, and 15 of those points are peek results carrying
 * full snapshots" is a decision — the new tool earns its cost or it does not. So this
 * reports and attributes, and nothing here ever fails a build.
 */

import type { Attribution, OptimizeSummary } from "./rollup.ts";

export interface MetricDelta {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  /** Fractional change. Zero baseline reports 0 rather than infinity. */
  ratio: number;
}

export interface Cause {
  source: string;
  baselineBytes: number;
  currentBytes: number;
  delta: number;
  /** This source's share of the total movement, so the biggest mover is obvious. */
  shareOfChange: number;
}

export interface Comparison {
  metrics: MetricDelta[];
  causes: Cause[];
  /** True when nothing moved enough to be worth a look. */
  quiet: boolean;
}

const WATCHED: Array<{ metric: string; pick: (value: OptimizeSummary) => number | undefined }> = [
  { metric: "context bytes per task", pick: (v) => v.contextBytesPerTask },
  { metric: "tool result bytes per task", pick: (v) => v.toolResultBytesPerTask },
  { metric: "snapshots per task", pick: (v) => v.observationsPerTask },
  { metric: "turns per task", pick: (v) => v.turnsPerTask },
  { metric: "duplicate results per task", pick: (v) => v.duplicateResultsPerTask },
  { metric: "reads that changed nothing, per task", pick: (v) => v.zeroChangeObservationsPerTask },
  { metric: "repeat navigations per task", pick: (v) => v.repeatNavigationsPerTask },
  { metric: "card bytes", pick: (v) => v.cardBytes },
  { metric: "tool schema bytes", pick: (v) => v.toolSchemaBytes },
  { metric: "tokens per task", pick: (v) => v.tokensPerTask },
  { metric: "cost per task", pick: (v) => v.costPerTask },
];

/** Below this, a move is noise from a different task selection or a timing wobble. */
export const NOTABLE_RATIO = 0.05;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ratio(baseline: number, current: number): number {
  if (baseline === 0) return current === 0 ? 0 : 1;
  return round((current - baseline) / baseline);
}

function attributionOf(summary: OptimizeSummary): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of summary.attribution as Attribution[]) map.set(entry.source, entry.bytes);
  return map;
}

export function compareSummaries(
  baseline: OptimizeSummary,
  current: OptimizeSummary,
): Comparison {
  const metrics: MetricDelta[] = [];
  for (const watched of WATCHED) {
    const before = watched.pick(baseline);
    const now = watched.pick(current);
    // A metric missing on either side is not a change: a token-free run has no tokens.
    if (before === undefined || now === undefined) continue;
    metrics.push({
      metric: watched.metric,
      baseline: before,
      current: now,
      delta: round(now - before, 1),
      ratio: ratio(before, now),
    });
  }

  // Attribution is per-suite rather than per-task, so scale it when the selection
  // differed; otherwise adding tasks would look like a regression.
  const scale =
    baseline.tasks > 0 && current.tasks > 0 ? baseline.tasks / current.tasks : 1;
  const before = attributionOf(baseline);
  const now = attributionOf(current);
  const sources = new Set([...before.keys(), ...now.keys()]);

  const causes: Cause[] = [];
  let movement = 0;
  for (const source of sources) {
    const baselineBytes = before.get(source) ?? 0;
    const currentBytes = Math.round((now.get(source) ?? 0) * scale);
    const delta = currentBytes - baselineBytes;
    if (delta === 0) continue;
    movement += Math.abs(delta);
    causes.push({ source, baselineBytes, currentBytes, delta, shareOfChange: 0 });
  }
  for (const cause of causes) {
    cause.shareOfChange = movement > 0 ? round(Math.abs(cause.delta) / movement) : 0;
  }
  causes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    metrics,
    causes,
    quiet: metrics.every((entry) => Math.abs(entry.ratio) < NOTABLE_RATIO),
  };
}

/** Reports carry the summary under `optimize`; accept either a report or a bare summary. */
export function compareReports(baseline: unknown, current: unknown): Comparison {
  return compareSummaries(summaryOf(baseline), summaryOf(current));
}

function summaryOf(value: unknown): OptimizeSummary {
  const candidate = value as { optimize?: OptimizeSummary } & Partial<OptimizeSummary>;
  if (candidate?.optimize) return candidate.optimize;
  if (Array.isArray(candidate?.attribution)) return candidate as OptimizeSummary;
  throw new Error("expected a suite report with an `optimize` summary, or a summary itself");
}

export function formatComparison(comparison: Comparison): string {
  const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
  const lines: string[] = [];

  if (comparison.quiet) {
    lines.push("No notable change against the baseline.");
  }

  for (const entry of comparison.metrics) {
    if (Math.abs(entry.ratio) < NOTABLE_RATIO) continue;
    lines.push(`${entry.metric}: ${entry.baseline} -> ${entry.current} (${pct(entry.ratio)})`);
  }

  const rises = comparison.causes.filter((cause) => cause.delta > 0).slice(0, 5);
  if (!comparison.quiet && rises.length > 0) {
    lines.push("");
    lines.push("of which:");
    for (const cause of rises) {
      lines.push(
        `  +${String(cause.delta).padStart(7)} B  ${cause.source.padEnd(24)} ` +
          `${(cause.shareOfChange * 100).toFixed(0)}% of the movement`,
      );
    }
  }

  const falls = comparison.causes.filter((cause) => cause.delta < 0).slice(0, 5);
  if (!comparison.quiet && falls.length > 0) {
    lines.push("");
    lines.push("and down:");
    for (const cause of falls) {
      lines.push(`  ${String(cause.delta).padStart(8)} B  ${cause.source}`);
    }
  }

  lines.push("");
  lines.push("Reported, not enforced. Decide whether the cause is worth the cost.");
  return lines.join("\n");
}
