import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LedgerEvent } from "../../src/core/ledger.ts";
import {
  MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD,
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
});
