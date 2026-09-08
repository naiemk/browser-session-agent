import type { DerivedDisplayStatus, HumanRequest, Job, JobLifecycle, ResourceState } from "../domain/types.ts";

export interface DisplayStatusInput {
  job: Pick<Job, "lifecycle">;
  leaseHeld?: boolean;
  openHumanRequests?: readonly Pick<HumanRequest, "status">[];
  resourceBlocked?: boolean;
  /** True when eligible work exists but no ExecutionHost is attached. */
  runtimeUnavailable?: boolean;
  /** Pure eligibility: active job with nothing to run and no blockers. */
  nothingEligible?: boolean;
}

/**
 * DOM-06 — derived display status is computed, never written to Job.lifecycle.
 */
export function deriveDisplayStatus(input: DisplayStatusInput): DerivedDisplayStatus {
  const lifecycle = input.job.lifecycle;
  if (lifecycle !== "active") return lifecycle;

  if (input.runtimeUnavailable) return "runtime_unavailable";
  if (input.leaseHeld) return "running";
  if (input.openHumanRequests?.some((item) => item.status === "waiting" || item.status === "ready" || item.status === "rehydrating")) {
    return "waiting_human";
  }
  if (input.resourceBlocked) return "blocked";
  if (input.nothingEligible) return "idle";
  return "active";
}

/** Guard used by tests: display values must never appear as stored lifecycle. */
export function isStoredLifecycle(value: string): value is JobLifecycle {
  return (
    value === "planning" ||
    value === "awaiting_plan_approval" ||
    value === "active" ||
    value === "paused" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "archived"
  );
}

export function resourceIsBlocked(state: ResourceState | undefined, nowIso: string): boolean {
  if (!state) return false;
  if (state.circuitOpenUntil && state.circuitOpenUntil > nowIso) return true;
  if (state.notBefore && state.notBefore > nowIso) return true;
  return false;
}
