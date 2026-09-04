import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareSummaries, formatComparison, NOTABLE_RATIO } from "../../src/optimize/regress.ts";
import { formatRollup, rollup, summarize } from "../../src/optimize/rollup.ts";
import type { MetricRecord } from "../../src/runtime/metrics.ts";
import type { LedgerEvent } from "../../src/core/ledger.ts";

function records(): MetricRecord[] {
  return [
    {
      kind: "run",
      at: new Date().toISOString(),
      model: "openrouter/test",
      cardBytes: 2000,
      toolSchemaBytes: 6000,
      toolCount: 13,
      maxTurns: 16,
    },
    { kind: "context", turn: 1, bytes: 9000, liveBytes: 9000, placeholderBytes: 0, messages: 2, rewrittenFrom: -1 },
    {
      kind: "turn",
      turn: 1,
      inputTokens: 2500,
      outputTokens: 60,
      cacheReadTokens: 0,
      cacheWriteTokens: 2500,
      costUsd: 0.001,
    },
    { kind: "tool_result", turn: 1, tool: "observe", bytes: 900, hash: "snap1" },
    {
      kind: "observation",
      turn: 1,
      tool: "observe",
      url: "https://x.test/a",
      controls: 40,
      bytes: 900,
      changes: 0,
      hash: "snap1",
      keyCollisions: 12,
    },
    { kind: "context", turn: 2, bytes: 11000, liveBytes: 8000, placeholderBytes: 3000, messages: 4, rewrittenFrom: 1 },
    {
      kind: "turn",
      turn: 2,
      inputTokens: 400,
      outputTokens: 40,
      cacheReadTokens: 2600,
      cacheWriteTokens: 0,
      costUsd: 0.0004,
    },
    { kind: "tool_result", turn: 2, tool: "observe", bytes: 900, hash: "snap1" },
    {
      kind: "observation",
      turn: 2,
      tool: "observe",
      url: "https://x.test/a",
      controls: 40,
      bytes: 900,
      changes: 0,
      hash: "snap1",
      keyCollisions: 12,
    },
    { kind: "tool_result", turn: 2, tool: "act", bytes: 1400, hash: "act1" },
  ];
}

const events: LedgerEvent[] = [
  {
    id: "ev1",
    goalId: "g",
    ts: new Date().toISOString(),
    type: "action",
    action: { kind: "navigate", url: "https://x.test/a" },
  },
  {
    id: "ev2",
    goalId: "g",
    ts: new Date().toISOString(),
    type: "action",
    action: { kind: "navigate", url: "https://x.test/a" },
  },
  {
    id: "ev3",
    goalId: "g",
    ts: new Date().toISOString(),
    type: "probe",
    payload: { query: { kind: "links" } },
  },
  {
    id: "ev4",
    goalId: "g",
    ts: new Date().toISOString(),
    type: "probe",
    payload: { query: { kind: "links" } },
  },
];

describe("the rollup", () => {
  it("splits tokens and reports the cache share, which the total hides", () => {
    const value = rollup({ records: records(), goalId: "g" });
    assert.equal(value.tokens.input, 2900);
    assert.equal(value.tokens.cacheRead, 2600);
    assert.equal(value.tokens.output, 100);
    // 2600 cache reads against 5500 prompt tokens.
    assert.equal(value.tokens.cacheReadShare, 0.473);
  });

  it("attributes bytes by payload, counting fixed overhead once per turn", () => {
    const value = rollup({ records: records(), goalId: "g" });
    const bySource = new Map(value.attribution.map((entry) => [entry.source, entry.bytes]));

    // Two turns, so the card and schemas are each sent twice.
    assert.equal(bySource.get("card"), 4000);
    assert.equal(bySource.get("toolSchemas"), 12000);
    assert.equal(bySource.get("tool:observe"), 1800);
    assert.equal(bySource.get("tool:act"), 1400);

    assert.equal(value.attribution[0]?.source, "toolSchemas", "sorted biggest first");
  });

  it("counts a result bought twice, and a read that changed nothing", () => {
    const value = rollup({ records: records(), goalId: "g" });
    assert.equal(value.duplicates.repeatedResults, 1);
    assert.equal(value.duplicates.repeatedResultBytes, 900);
    assert.equal(value.duplicates.zeroChangeObservations, 1);
  });

  it("takes repeat visits and repeat probes from the ledger", () => {
    const value = rollup({ records: records(), events, goalId: "g" });
    assert.equal(value.duplicates.repeatNavigations, 1);
    assert.equal(value.duplicates.repeatProbes, 1);
  });

  it("reports where the prompt cache was invalidated", () => {
    const value = rollup({ records: records(), goalId: "g" });
    assert.equal(value.cache.turnsWithRewrite, 1);
    assert.equal(value.cache.meanRewrittenFrom, 1);
  });

  it("surfaces snapshots the page delta cannot tell apart", () => {
    const value = rollup({ records: records(), goalId: "g" });
    assert.equal(value.observations.withCollisions, 2);
    assert.equal(value.observations.maxCollisions, 12);
  });

  it("says nothing confidently about a run with no records", () => {
    const value = rollup({ records: [] });
    assert.equal(value.turns, 0);
    assert.equal(value.tokens.total, 0);
    assert.equal(value.tokens.cacheReadShare, 0);
    assert.deepEqual(value.duplicates.repeatedResults, 0);
  });

  it("prints the numbers a decision needs", () => {
    const text = formatRollup(rollup({ records: records(), events, goalId: "g" }));
    assert.match(text, /where the bytes went/);
    assert.match(text, /toolSchemas/);
    assert.match(text, /duplicate work/);
    assert.match(text, /prompt cache/);
  });
});

describe("summarising many runs", () => {
  it("reduces to per-task means so suites of different sizes compare", () => {
    const one = rollup({ records: records() });
    const summary = summarize([one, one]);
    assert.equal(summary.tasks, 2);
    assert.equal(summary.turnsPerTask, 2);
    // Attribution is a sum across tasks; the comparison scales it by task count.
    assert.equal(summary.attribution.find((e) => e.source === "card")?.bytes, 8000);
  });

  it("omits token fields for a token-free run rather than reporting zero", () => {
    const free = rollup({
      records: records().filter((record) => record.kind !== "turn"),
    });
    const summary = summarize([free]);
    assert.equal(summary.tokensPerTask, undefined);
    assert.equal(summary.costPerTask, undefined);
    assert.equal(summary.cacheReadShare, undefined);
  });
});

describe("comparing against a baseline", () => {
  const base = summarize([rollup({ records: records() })]);

  it("stays quiet when nothing moved", () => {
    const comparison = compareSummaries(base, base);
    assert.equal(comparison.quiet, true);
    assert.match(formatComparison(comparison), /No notable change/);
  });

  it("names the cause of a rise, not just its size", () => {
    const worse = structuredClone(base);
    worse.contextBytesPerTask *= 1.3;
    worse.attribution.push({ source: "tool:peek", bytes: 9000, share: 0.1 });

    const comparison = compareSummaries(base, worse);
    assert.equal(comparison.quiet, false);
    assert.equal(comparison.causes[0]?.source, "tool:peek");
    assert.ok(comparison.causes[0]!.delta > 0);

    const text = formatComparison(comparison);
    assert.match(text, /context bytes per task/);
    assert.match(text, /of which/);
    assert.match(text, /tool:peek/);
    assert.match(text, /Reported, not enforced/);
  });

  it("reports an improvement as plainly as a regression", () => {
    const better = structuredClone(base);
    better.contextBytesPerTask *= 0.6;
    const comparison = compareSummaries(base, better);
    assert.ok(comparison.metrics.some((entry) => entry.ratio < -NOTABLE_RATIO));
  });

  it("ignores a metric the other side does not have", () => {
    // A token-free mock baseline against a paid run: the token columns are incomparable,
    // and reporting a rise from nothing to 4,000 would be meaningless rather than useful.
    const tokenFree = summarize([
      rollup({ records: records().filter((record) => record.kind !== "turn") }),
    ]);
    const paid = structuredClone(base);
    paid.tokensPerTask = 4000;

    const comparison = compareSummaries(tokenFree, paid);
    assert.equal(tokenFree.tokensPerTask, undefined);
    assert.ok(!comparison.metrics.some((entry) => entry.metric === "tokens per task"));
    assert.ok(
      comparison.metrics.some((entry) => entry.metric === "context bytes per task"),
      "the structural metrics both sides have are still compared",
    );
  });

  it("does not read added tasks as a regression", () => {
    // Twice the tasks means twice the summed attribution; per-task cost is unchanged.
    const one = rollup({ records: records() });
    const comparison = compareSummaries(summarize([one]), summarize([one, one]));
    assert.deepEqual(
      comparison.causes.filter((cause) => cause.delta !== 0),
      [],
      "attribution is scaled by task count before comparing",
    );
  });
});
