import type {
  HumanRequest,
  Job,
  ResourceState,
  WorkItem,
  WorkItemId,
} from "./types.ts";

export type IneligibilityCode =
  | "paused"
  | "completed"
  | "cancelled"
  | "failed"
  | "archived"
  | "planning"
  | "awaiting_plan_approval"
  | "no_ready_work"
  | "waiting_human"
  | "resource_cooldown"
  | "resource_breaker"
  | "budget_exhausted"
  | "runtime_unavailable"
  | "lease_busy"
  | "dependencies_unmet"
  | "deferred";

export interface IneligibilityReason {
  code: IneligibilityCode;
  detail?: string;
  workItemId?: WorkItemId;
}

export type ScheduleDecision =
  | { kind: "dispatch"; workItemId: WorkItemId; reason: string }
  | { kind: "batch_dispatch"; workItemIds: WorkItemId[]; reason: string }
  | { kind: "ineligible"; reasons: IneligibilityReason[]; nextWakeAt?: string };

export interface SchedulerView {
  job: Job;
  workItems: readonly WorkItem[];
  humans: readonly HumanRequest[];
  resources: readonly ResourceState[];
  runtimeAvailable: boolean;
  leaseBusyWorkItemIds?: ReadonlySet<string>;
  spend?: { costUsd: number; siteActions: number };
  maxCostUsd?: number;
  /** Prefer jobs/work not recently served (fairness). */
  lastDispatchedAt?: Record<string, string>;
}

function earliest(...times: Array<string | undefined>): string | undefined {
  const present = times.filter((t): t is string => Boolean(t));
  if (present.length === 0) return undefined;
  return present.sort()[0];
}

/**
 * SCHED-01..08 — pure scheduler policy. No I/O.
 */
export function decideSchedule(view: SchedulerView, nowIso: string): ScheduleDecision {
  const { job } = view;
  if (job.lifecycle === "paused") {
    return { kind: "ineligible", reasons: [{ code: "paused" }] };
  }
  if (job.lifecycle === "completed") return { kind: "ineligible", reasons: [{ code: "completed" }] };
  if (job.lifecycle === "cancelled") return { kind: "ineligible", reasons: [{ code: "cancelled" }] };
  if (job.lifecycle === "failed") return { kind: "ineligible", reasons: [{ code: "failed" }] };
  if (job.lifecycle === "archived") return { kind: "ineligible", reasons: [{ code: "archived" }] };
  if (job.lifecycle === "planning") return { kind: "ineligible", reasons: [{ code: "planning" }] };
  if (job.lifecycle === "awaiting_plan_approval") {
    return { kind: "ineligible", reasons: [{ code: "awaiting_plan_approval" }] };
  }

  if (view.maxCostUsd !== undefined && (view.spend?.costUsd ?? 0) >= view.maxCostUsd) {
    return { kind: "ineligible", reasons: [{ code: "budget_exhausted", detail: "maxCostUsd" }] };
  }

  const openHumans = view.humans.filter(
    (h) => h.status === "waiting" || h.status === "ready" || h.status === "rehydrating",
  );
  const perishableOpen = openHumans.filter((h) => h.perishable);

  const reasons: IneligibilityReason[] = [];
  const candidates: WorkItem[] = [];

  for (const item of view.workItems) {
    if (item.status !== "ready" && item.status !== "pending") continue;
    if (item.status === "pending") {
      const depsMet = (item.dependencies ?? []).every((depId) => {
        const dep = view.workItems.find((w) => w.id === depId);
        return dep?.status === "done";
      });
      if (!depsMet) {
        reasons.push({ code: "dependencies_unmet", workItemId: item.id });
        continue;
      }
    }
    if (item.deferredUntil && item.deferredUntil > nowIso) {
      reasons.push({ code: "deferred", workItemId: item.id, detail: item.deferredUntil });
      continue;
    }
    if (view.leaseBusyWorkItemIds?.has(item.id)) {
      reasons.push({ code: "lease_busy", workItemId: item.id });
      continue; // SCHED-08: continue scanning
    }
    if (item.resourceKey) {
      const res = view.resources.find((r) => r.key === item.resourceKey);
      if (res?.circuitOpenUntil && res.circuitOpenUntil > nowIso) {
        reasons.push({ code: "resource_breaker", workItemId: item.id, detail: res.key });
        continue;
      }
      if (res?.notBefore && res.notBefore > nowIso) {
        reasons.push({ code: "resource_cooldown", workItemId: item.id, detail: res.key });
        continue;
      }
    }
    // SCHED-06: human-only / perishable blocks do not wake by timer alone
    if (perishableOpen.some((h) => h.workItemId === item.id)) {
      reasons.push({ code: "waiting_human", workItemId: item.id });
      continue;
    }
    candidates.push(item);
  }

  if (candidates.length === 0) {
    if (!view.runtimeAvailable && view.workItems.some((w) => w.status === "ready" || w.status === "pending")) {
      // eligible-looking graph but host missing is reported by dispatcher; policy may still say no_ready
    }
    const nextWakeAt = earliest(
      ...view.workItems.map((w) => w.deferredUntil),
      ...view.resources.map((r) => r.circuitOpenUntil),
      ...view.resources.map((r) => r.notBefore),
      ...openHumans.filter((h) => !h.perishable).map((h) => h.expiresAt),
      job.nextWakeAt,
    );
    if (openHumans.length > 0) {
      return {
        kind: "ineligible",
        reasons: reasons.length ? reasons : [{ code: "waiting_human" }],
        // perishable: omit timer wake (SCHED-06) when only perishable humans remain
        nextWakeAt: perishableOpen.length === openHumans.length ? undefined : nextWakeAt,
      };
    }
    return {
      kind: "ineligible",
      reasons: reasons.length ? reasons : [{ code: "no_ready_work" }],
      nextWakeAt,
    };
  }

  if (!view.runtimeAvailable) {
    return {
      kind: "ineligible",
      reasons: [{ code: "runtime_unavailable", workItemId: candidates[0]!.id }],
    };
  }

  // Fairness: least-recently dispatched first
  candidates.sort((a, b) => {
    const la = view.lastDispatchedAt?.[a.id] ?? "";
    const lb = view.lastDispatchedAt?.[b.id] ?? "";
    return la.localeCompare(lb) || a.id.localeCompare(b.id);
  });

  const readOnlyBatch = candidates.filter(
    (c) => c.templateId.startsWith("readonly:") || c.objective.startsWith("[readonly]"),
  );
  if (readOnlyBatch.length > 1 && readOnlyBatch.length === candidates.length) {
    return {
      kind: "batch_dispatch",
      workItemIds: readOnlyBatch.slice(0, 8).map((c) => c.id),
      reason: "homogeneous_readonly_batch",
    };
  }

  const pick = candidates[0]!;
  return { kind: "dispatch", workItemId: pick.id, reason: "eligible" };
}
