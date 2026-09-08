import { DomainError } from "./errors.ts";
import type { Job, JobLifecycle } from "./types.ts";

/** DOM-03 — legal Job.lifecycle transitions only. */
export const JOB_LIFECYCLE_TRANSITIONS: Readonly<Record<JobLifecycle, readonly JobLifecycle[]>> = {
  planning: ["awaiting_plan_approval", "cancelled"],
  awaiting_plan_approval: ["planning", "active", "cancelled"],
  active: ["paused", "completed", "failed", "cancelled", "planning"],
  paused: ["active", "cancelled"],
  failed: ["planning", "cancelled", "archived"],
  completed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

export function assertJobTransition(from: JobLifecycle, to: JobLifecycle): void {
  const allowed = JOB_LIFECYCLE_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new DomainError("illegal_job_transition", `cannot transition job from ${from} to ${to}`, {
      from,
      to,
      allowed: [...allowed],
    });
  }
}

export function transitionJobLifecycle(job: Job, to: JobLifecycle, now: string): Job {
  assertJobTransition(job.lifecycle, to);
  const next: Job = {
    ...job,
    lifecycle: to,
    updatedAt: now,
  };
  if (to === "paused") next.pausedAt = now;
  if (to === "active" || to === "planning") delete next.pausedAt;
  if (to === "completed" || to === "failed" || to === "cancelled" || to === "archived") {
    next.completedAt = next.completedAt ?? now;
  }
  return next;
}

/** Cancel command (DOM-07) — domain half; adapters land in CAMPAIGN-04-T01. */
export function cancelJob(job: Job, now: string): Job {
  if (job.lifecycle === "cancelled" || job.lifecycle === "archived") {
    throw new DomainError("already_terminal", `job is already ${job.lifecycle}`);
  }
  if (job.lifecycle === "completed") {
    throw new DomainError("illegal_job_transition", "completed jobs cannot be cancelled; archive instead");
  }
  return transitionJobLifecycle(job, "cancelled", now);
}
