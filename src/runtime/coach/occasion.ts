/**
 * Coach occasions (COACH-20 … COACH-22). Mechanical gates — no provider.
 *
 * Waste breakers stay in rescue.ts. Off-track / close gates live here.
 */

import type { LedgerEvent } from "../../core/ledger.ts";
import type { CoachDigest } from "./digest.ts";
import { yieldKindOf } from "./yield.ts";
import {
  MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD,
  MAGPIE_RESCUE_NAVIGATION_CYCLES,
  magpieRescueDecision,
  siteActionsWithoutCandidateYield,
  type MagpieRescueDecision,
} from "./rescue.ts";

export type CoachOccasion = "scout" | "steer" | "close";
export type CoachDecision = "continue" | "patch" | "extend" | "accept" | "halt";

/** Accepted rows before off-track heuristics apply. */
export const OFF_TRACK_MIN_ACCEPTED = 5;
/** Share of rejection reasons that mention unknown before off-track trips. */
export const OFF_TRACK_UNKNOWN_SHARE = 0.4;

export const OCCASION_QUESTIONS: Record<CoachOccasion, string> = {
  scout: "What repeatable acquisition loop should harvest try next?",
  steer: "Are we heading at SUCCESS cheaply enough? If not, patch the remainder.",
  close: "Is SUCCESS met now? Accept, extend with the cheapest increment, or halt.",
};

export function isCoachOccasion(value: unknown): value is CoachOccasion {
  return value === "scout" || value === "steer" || value === "close";
}

export function isCoachDecision(value: unknown): value is CoachDecision {
  return (
    value === "continue" ||
    value === "patch" ||
    value === "extend" ||
    value === "accept" ||
    value === "halt"
  );
}

export interface OffTrackInput {
  accepted: number;
  rejected: number;
  criteriaCount: number;
  factEstablished: number;
  rejectionReasons: ReadonlyArray<{ reason: string; count: number }>;
}

export function unknownShare(reasons: ReadonlyArray<{ reason: string; count: number }>): number {
  let unknown = 0;
  let total = 0;
  for (const row of reasons) {
    total += row.count;
    if (/\bunknown\b/i.test(row.reason)) unknown += row.count;
  }
  return total === 0 ? 0 : unknown / total;
}

export function countFactEstablished(events: readonly LedgerEvent[]): number {
  let n = 0;
  for (const event of events) {
    if (yieldKindOf(event) === "fact_established") n += 1;
  }
  return n;
}

/** Heuristic: partial deliverable is not on track to SUCCESS. */
export function isOffTrack(input: OffTrackInput): boolean {
  if (input.accepted < OFF_TRACK_MIN_ACCEPTED) return false;
  if (input.criteriaCount > 0 && input.factEstablished === 0) return true;
  const share = unknownShare(input.rejectionReasons);
  if (share >= OFF_TRACK_UNKNOWN_SHARE && input.rejected + input.accepted >= OFF_TRACK_MIN_ACCEPTED) {
    return true;
  }
  return false;
}

export function offTrackFromDigest(
  digest: Pick<CoachDigest, "counts" | "rejectionReasons" | "criteria">,
  factEstablished: number,
): boolean {
  return isOffTrack({
    accepted: digest.counts.accepted,
    rejected: digest.counts.rejected,
    criteriaCount: digest.criteria.length,
    factEstablished,
    rejectionReasons: digest.rejectionReasons,
  });
}

export type SteerGateDecision = MagpieRescueDecision;

export interface SteerGateInput {
  siteActionsWithoutCandidateYield: number;
  navigationCycles: number;
  lostPlace: boolean;
  wallMs?: number;
  emptyRescues: number;
  offTrack: boolean;
}

/** Waste (rescue) or off-track → review; empty prior steer/close → halt. */
export function steerGateDecision(input: SteerGateInput): SteerGateDecision {
  const waste = magpieRescueDecision({
    siteActionsWithoutCandidateYield: input.siteActionsWithoutCandidateYield,
    navigationCycles: input.navigationCycles,
    lostPlace: input.lostPlace,
    wallMs: input.wallMs,
    emptyRescues: input.emptyRescues,
  });
  if (waste === "halt") return "halt";
  if (waste === "review") return "review";
  if (input.offTrack) {
    if (input.emptyRescues >= 1) return "halt";
    return "review";
  }
  return "none";
}

export type CloseGateDecision = "pass" | "fail";

export interface CloseGateInput {
  reportStatus: "success" | "blocked" | "failed";
  accepted: number;
  criteriaCount: number;
  offTrack: boolean;
}

/**
 * Skip the review model when success looks complete enough.
 * Blocked/failed always fail the gate (may still close-coach for extend/halt).
 */
export function closeGateDecision(input: CloseGateInput): CloseGateDecision {
  if (input.reportStatus !== "success") return "fail";
  if (input.offTrack) return "fail";
  if (input.criteriaCount > 0 && input.accepted < 1) return "fail";
  return "pass";
}

export function siteActionsWithoutYieldSince(
  events: readonly LedgerEvent[],
): number {
  return siteActionsWithoutCandidateYield(events);
}

export {
  MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD,
  MAGPIE_RESCUE_NAVIGATION_CYCLES,
};
