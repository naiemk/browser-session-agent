/**
 * Magpie Execute rescue (COACH-11 analogue). Not the job compiler (T04).
 *
 * Yield breakers only. Wall-clock is accepted on the input so callers can pass it and
 * this function still ignores it.
 */

import type { LedgerEvent } from "../../core/ledger.ts";
import { yieldKindOf } from "./yield.ts";

/** Site actions since the last candidate_* (or checkpoint, if none) that trip rescue. */
export const MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD = 12;
/** Distinct list → entity → list cycles since the checkpoint that trip rescue. */
export const MAGPIE_RESCUE_NAVIGATION_CYCLES = 2;

export type MagpieRescueDecision = "none" | "review" | "halt";

export interface MagpieRescueInput {
  siteActionsWithoutCandidateYield: number;
  navigationCycles: number;
  lostPlace: boolean;
  /** Ignored. Present so a fixture can prove elapsed time is not a trigger. */
  wallMs?: number;
  /**
   * Rescue reviews that ended with no new artifact and no later candidate_*.
   * One empty rescue already happened → halt instead of a third silent review.
   */
  emptyRescues: number;
}

const CANDIDATE_KINDS = new Set(["candidate_accepted", "candidate_rejected", "candidate_duplicate"]);

export function isCandidateYieldEvent(event: LedgerEvent): boolean {
  const kind = yieldKindOf(event);
  return Boolean(kind && CANDIDATE_KINDS.has(kind));
}

export function hasScoutYield(events: readonly LedgerEvent[]): boolean {
  return events.some((event) => {
    const kind = yieldKindOf(event);
    return kind === "route_affordance" || kind === "fact_established";
  });
}

export function harvestFollowed(events: readonly LedgerEvent[]): boolean {
  return events.some(isCandidateYieldEvent);
}

export function siteActionsWithoutCandidateYield(events: readonly LedgerEvent[]): number {
  let last = -1;
  for (let i = 0; i < events.length; i++) {
    if (isCandidateYieldEvent(events[i]!)) last = i;
  }
  let count = 0;
  for (let i = last + 1; i < events.length; i++) {
    if (events[i]?.type === "action") count += 1;
  }
  return count;
}

export function magpieRescueDecision(input: MagpieRescueInput): MagpieRescueDecision {
  void input.wallMs;
  const breaker =
    input.siteActionsWithoutCandidateYield >= MAGPIE_RESCUE_ACTIONS_WITHOUT_YIELD ||
    input.navigationCycles >= MAGPIE_RESCUE_NAVIGATION_CYCLES ||
    input.lostPlace;
  if (!breaker) return "none";
  if (input.emptyRescues >= 1) return "halt";
  return "review";
}
