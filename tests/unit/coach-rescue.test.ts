import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LedgerEvent } from "../../src/core/ledger.ts";
import {
  MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD,
  hasScoutYield,
  magpieRescueDecision,
  siteActionsWithoutCandidateYield,
} from "../../src/runtime/coach/rescue.ts";
import { yieldInput } from "../../src/runtime/coach/yield.ts";

describe("AGENT-16-T06 Magpie rescue decision", () => {
  it("ignores wall-clock when there is no yield breaker", () => {
    assert.equal(
      magpieRescueDecision({
        siteActionsWithoutCandidateYield: 0,
        navigationCycles: 0,
        lostPlace: false,
        wallMs: 3_600_000,
        emptyRescues: 0,
      }),
      "none",
    );
  });

  it("reviews after N site actions without candidate yield, then halts on a second empty rescue", () => {
    assert.equal(
      magpieRescueDecision({
        siteActionsWithoutCandidateYield: MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD,
        navigationCycles: 0,
        lostPlace: false,
        emptyRescues: 0,
      }),
      "review",
    );
    assert.equal(
      magpieRescueDecision({
        siteActionsWithoutCandidateYield: MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD,
        navigationCycles: 0,
        lostPlace: false,
        emptyRescues: 1,
      }),
      "halt",
    );
  });

  it("counts site actions after the last candidate_* only", () => {
    const events = [
      { type: "action", ts: "t0" },
      yieldInput({ kind: "candidate_rejected", summary: "brand" }),
      { type: "action", ts: "t1" },
      { type: "action", ts: "t2" },
    ] as LedgerEvent[];
    assert.equal(siteActionsWithoutCandidateYield(events), 2);
  });

  it("ignores plan-mode route_affordance before the Execute scout epoch", () => {
    const events = [
      {
        ...yieldInput({ kind: "route_affordance", summary: "hashtag redirects" }),
        ts: "2026-09-10T19:30:00.000Z",
      },
      {
        ...yieldInput({ kind: "fact_established", summary: "logged in" }),
        ts: "2026-09-10T19:30:00.000Z",
      },
      {
        ...yieldInput({ kind: "route_affordance", summary: "keyword grid loads" }),
        ts: "2026-09-10T19:32:00.000Z",
      },
    ] as LedgerEvent[];
    assert.equal(hasScoutYield(events), true);
    assert.equal(hasScoutYield(events, "2026-09-10T19:31:22.000Z"), true);
    assert.equal(hasScoutYield(events, "2026-09-10T19:33:00.000Z"), false);
  });
});
