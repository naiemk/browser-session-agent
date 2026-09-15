import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LedgerEvent } from "../../src/core/ledger.ts";
import {
  closeGateDecision,
  countFactEstablished,
  isOffTrack,
  OFF_TRACK_MIN_ACCEPTED,
  steerGateDecision,
  unknownShare,
} from "../../src/runtime/coach/occasion.ts";
import { MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD } from "../../src/runtime/coach/rescue.ts";
import { yieldInput } from "../../src/runtime/coach/yield.ts";

describe("coach occasion gates (COACH-20…22)", () => {
  it("skips steer when neither waste nor off-track", () => {
    assert.equal(
      steerGateDecision({
        siteActionsWithoutCandidateYield: 0,
        navigationCycles: 0,
        lostPlace: false,
        emptyRescues: 0,
        offTrack: false,
      }),
      "none",
    );
  });

  it("trips steer on waste breaker", () => {
    assert.equal(
      steerGateDecision({
        siteActionsWithoutCandidateYield: MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD,
        navigationCycles: 0,
        lostPlace: false,
        emptyRescues: 0,
        offTrack: false,
      }),
      "review",
    );
  });

  it("trips steer on off-track unknown-rate after enough accepts", () => {
    assert.equal(
      isOffTrack({
        accepted: OFF_TRACK_MIN_ACCEPTED,
        rejected: 5,
        criteriaCount: 2,
        factEstablished: 3,
        rejectionReasons: [
          { reason: "email unknown", count: 4 },
          { reason: "ok", count: 1 },
        ],
      }),
      true,
    );
    assert.ok(unknownShare([{ reason: "email unknown", count: 4 }, { reason: "ok", count: 1 }]) >= 0.4);
    assert.equal(
      steerGateDecision({
        siteActionsWithoutCandidateYield: 0,
        navigationCycles: 0,
        lostPlace: false,
        emptyRescues: 0,
        offTrack: true,
      }),
      "review",
    );
  });

  it("trips off-track when criteria exist and fact_established is zero", () => {
    assert.equal(
      isOffTrack({
        accepted: OFF_TRACK_MIN_ACCEPTED,
        rejected: 0,
        criteriaCount: 1,
        factEstablished: 0,
        rejectionReasons: [],
      }),
      true,
    );
  });

  it("close gate passes healthy success; fails off-track or empty criteria harvest", () => {
    assert.equal(
      closeGateDecision({
        reportStatus: "success",
        accepted: 3,
        criteriaCount: 2,
        offTrack: false,
      }),
      "pass",
    );
    assert.equal(
      closeGateDecision({
        reportStatus: "success",
        accepted: 0,
        criteriaCount: 0,
        offTrack: false,
      }),
      "pass",
    );
    assert.equal(
      closeGateDecision({
        reportStatus: "success",
        accepted: 0,
        criteriaCount: 1,
        offTrack: false,
      }),
      "fail",
    );
    assert.equal(
      closeGateDecision({
        reportStatus: "success",
        accepted: 8,
        criteriaCount: 1,
        offTrack: true,
      }),
      "fail",
    );
    assert.equal(
      closeGateDecision({
        reportStatus: "blocked",
        accepted: 8,
        criteriaCount: 0,
        offTrack: false,
      }),
      "fail",
    );
  });

  it("counts fact_established yields", () => {
    const events = [
      yieldInput({ kind: "candidate_accepted", summary: "row" }),
      yieldInput({ kind: "fact_established", summary: "pricing table" }),
      yieldInput({ kind: "route_affordance", summary: "list" }),
    ] as LedgerEvent[];
    assert.equal(countFactEstablished(events), 1);
  });
});
