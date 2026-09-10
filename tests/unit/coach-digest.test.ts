import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { LedgerEvent } from "../../src/core/ledger.ts";
import type { MetricRecord } from "../../src/runtime/metrics.ts";
import { compileDigest, COACH_DIGEST_MAX_BYTES } from "../../src/runtime/coach/digest.ts";
import { yieldInput } from "../../src/runtime/coach/yield.ts";
import { importSpecifiers } from "./core-boundary.test.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COACH_DIR = path.join(ROOT, "src/runtime/coach");

function ev(
  index: number,
  rest: Omit<LedgerEvent, "id" | "goalId" | "ts"> & { ts?: string },
): LedgerEvent {
  return {
    id: `ev_${index}`,
    goalId: "g_coach",
    ts: rest.ts ?? new Date(Date.UTC(2026, 8, 9, 13, 0, index)).toISOString(),
    ...rest,
  };
}

const LIST = "https://www.instagram.com/p/club_tagged/";
const PROFILE = "https://www.instagram.com/some_user/";
const VENUE = "https://www.instagram.com/karaoke_minsk/";

describe("AGENT-16-T01 trajectory digest", () => {
  it("flags a list → profile → back cycle and lost_place with zero accepts", () => {
    const events: LedgerEvent[] = [
      ev(1, {
        type: "action",
        intent: "open tagged list",
        action: { kind: "click" },
        before: { url: LIST, title: "Tagged", controls: 12 },
        after: { url: LIST, title: "Tagged", changes: [] },
        outcome: { ok: true },
      }),
      ev(2, {
        type: "action",
        intent: "open profile",
        action: { kind: "click" },
        before: { url: LIST, title: "Tagged", controls: 12 },
        after: { url: PROFILE, title: "some_user", changes: ["navigated"] },
        outcome: { ok: true },
      }),
      ev(3, {
        type: "action",
        intent: "back to list",
        action: { kind: "click" },
        before: { url: PROFILE, title: "some_user", controls: 8 },
        after: { url: LIST, title: "Tagged", changes: ["navigated"] },
        outcome: { ok: true },
      }),
      ev(4, yieldInput({ kind: "lost_place", summary: "tagged grid gone after Back" })),
    ];
    const metrics: MetricRecord[] = [
      { kind: "turn", turn: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 },
      { kind: "turn", turn: 2, inputTokens: 200, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.02 },
      { kind: "turn", turn: 3, inputTokens: 400, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.04 },
    ];
    const compiled = compileDigest({
      events,
      metrics,
      goalText: "Find 200 Minsk party-goers",
      criteria: ["nightlife", "200 followers"],
    });
    assert.equal(compiled.digest.counts.accepted, 0);
    assert.equal(compiled.digest.lostPlace, true);
    assert.ok(compiled.digest.navigationCycles.length >= 1);
    assert.equal(compiled.digest.navigationCycles[0]?.lostPlace, true);
    assert.ok((compiled.digest.costUsd ?? 0) > 0.06);
    assert.ok(compiled.bytes <= COACH_DIGEST_MAX_BYTES);
    assert.doesNotMatch(compiled.json, /controls:/);
    assert.doesNotMatch(compiled.json, /"controls":\s*\[/);
  });

  it("guided venue → tagged → peek → accept shows yield per peek", () => {
    const events: LedgerEvent[] = [
      ev(1, {
        type: "action",
        intent: "open venue",
        action: { kind: "navigate" },
        after: { url: VENUE, title: "Karaoke", changes: [] },
        outcome: { ok: true },
      }),
      ev(2, {
        type: "probe",
        intent: "open tagged",
        before: { url: VENUE, title: "Karaoke", controls: 20 },
        after: { url: LIST, title: "Tagged", changes: [] },
        outcome: { ok: true },
      }),
      ev(3, {
        type: "probe",
        intent: "peek profile",
        payload: { peek: PROFILE },
        before: { url: LIST, title: "Tagged", controls: 12 },
        after: { url: PROFILE, title: "some_user", changes: [] },
        outcome: { ok: true, detail: "still on tagged" },
      }),
      ev(4, yieldInput({ kind: "candidate_accepted", summary: "some_user", reason: "nightlife + 400 followers" })),
    ];
    const compiled = compileDigest({
      events,
      goalText: "Find party-goers",
      criteria: ["nightlife"],
    });
    assert.equal(compiled.digest.counts.accepted, 1);
    assert.equal(compiled.digest.lostPlace, false);
    const peeks = compiled.digest.actions.filter((action) => action.tool === "peek");
    assert.equal(peeks.length, 1);
    assert.ok(compiled.digest.counts.accepted / peeks.length >= 1);
    assert.doesNotMatch(compiled.json, /controls:/);
  });

  it("truncates oldest action lines first and keeps criteria plus yield totals", () => {
    const events: LedgerEvent[] = [
      ev(0, yieldInput({ kind: "candidate_accepted", summary: "keep-me" })),
    ];
    for (let i = 1; i <= 200; i++) {
      events.push(
        ev(i, {
          type: "action",
          intent: `wander ${i} ${"x".repeat(80)}`,
          action: { kind: "click" },
          after: { url: `https://example.test/p/${i}`, title: `P${i}`, changes: [] },
          outcome: { ok: true, detail: "ok ".repeat(40) },
        }),
      );
    }
    const compiled = compileDigest({
      events,
      goalText: "Collect candidates",
      criteria: ["MUST-KEEP-CRITERION nightlife match"],
    });
    assert.ok(compiled.bytes <= COACH_DIGEST_MAX_BYTES);
    assert.equal(compiled.truncated, true);
    assert.equal(compiled.digest.counts.accepted, 1);
    assert.ok(compiled.digest.criteria.some((item) => item.includes("MUST-KEEP-CRITERION")));
    assert.ok(compiled.digest.actions.length < 200);
  });

  it("attaches a short snapshot quote only to a named failure", () => {
    const events: LedgerEvent[] = [
      ev(1, {
        type: "failure",
        intent: "scroll followers",
        outcome: { ok: false, detail: "no-progress" },
        payload: { quote: "Followers dialog did not load more rows. ".repeat(40) },
      }),
    ];
    const compiled = compileDigest({
      events,
      goalText: "collect",
      criteria: ["nightlife"],
    });
    assert.equal(compiled.digest.snapshotQuotes.length, 1);
    assert.ok(compiled.digest.snapshotQuotes[0]!.quote.length <= 500);
    assert.match(compiled.digest.snapshotQuotes[0]!.failure, /scroll followers/);
  });

  it("is pure: no Pi, Playwright, or node:fs in the coach digest modules", () => {
    for (const name of ["digest.ts", "yield.ts", "strategy.ts", "rescue.ts"]) {
      const source = readFileSync(path.join(COACH_DIR, name), "utf8");
      for (const specifier of importSpecifiers(source)) {
        assert.doesNotMatch(specifier, /playwright/i);
        assert.doesNotMatch(specifier, /^node:fs/);
        assert.doesNotMatch(specifier, /pi-api/);
        assert.doesNotMatch(specifier, /\/optimize\//);
      }
    }
  });
});
