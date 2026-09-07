import type { Clock } from "../core/clock.ts";
import type { ResourcePace, SchedulerRecord, SpecRecord } from "./types.ts";

export function clampRetryMs(
  recommended: number | undefined,
  spec: SpecRecord,
  serverRetryAfterMs?: number,
): number {
  const { minCooldownMs, maxCooldownMs } = spec.pacing;
  const raw = serverRetryAfterMs ?? recommended ?? minCooldownMs;
  return Math.min(maxCooldownMs, Math.max(minCooldownMs, raw));
}

export function withJitter(ms: number, jitter: (unit: number) => number = Math.random): number {
  return Math.round(ms * (0.85 + jitter(1) * 0.3));
}

export function resourceKey(host: string, account = "default"): string {
  return `${host}::${account}`;
}

export function recordFailure(
  scheduler: SchedulerRecord,
  key: string,
  spec: SpecRecord,
  clock: Clock,
  retryMs: number,
): SchedulerRecord {
  const current = scheduler.resources[key] ?? { failures: 0 };
  const failures = current.failures + 1;
  const notBefore = new Date(clock.nowMs() + retryMs).toISOString();
  const circuitOpenUntil =
    failures >= spec.pacing.circuitBreakerAfter
      ? new Date(clock.nowMs() + spec.pacing.maxCooldownMs).toISOString()
      : current.circuitOpenUntil;
  const next: ResourcePace = { failures, notBefore, circuitOpenUntil };
  return {
    ...scheduler,
    resources: { ...scheduler.resources, [key]: next },
  };
}

export function recordSuccess(scheduler: SchedulerRecord, key: string): SchedulerRecord {
  const current = scheduler.resources[key];
  if (!current) return scheduler;
  return {
    ...scheduler,
    resources: {
      ...scheduler.resources,
      [key]: { failures: 0, notBefore: undefined, circuitOpenUntil: undefined },
    },
  };
}

export function resourceBlocked(
  scheduler: SchedulerRecord,
  key: string,
  nowIso: string,
): boolean {
  const current = scheduler.resources[key];
  if (!current) return false;
  if (current.circuitOpenUntil && current.circuitOpenUntil > nowIso) return true;
  if (current.notBefore && current.notBefore > nowIso) return true;
  return false;
}

export function consumeGrant(scheduler: SchedulerRecord, grantId: string): SchedulerRecord {
  const used = scheduler.grantUsage[grantId]?.usedCount ?? 0;
  return {
    ...scheduler,
    grantUsage: { ...scheduler.grantUsage, [grantId]: { usedCount: used + 1 } },
  };
}

export function remainingGrant(scheduler: SchedulerRecord, grantId: string, maxCount: number): number {
  return Math.max(0, maxCount - (scheduler.grantUsage[grantId]?.usedCount ?? 0));
}

export function addSpend(
  scheduler: SchedulerRecord,
  delta: { costUsd?: number; attempts?: number; siteActions?: number },
): SchedulerRecord {
  return {
    ...scheduler,
    spend: {
      costUsd: scheduler.spend.costUsd + (delta.costUsd ?? 0),
      attempts: scheduler.spend.attempts + (delta.attempts ?? 0),
      siteActions: scheduler.spend.siteActions + (delta.siteActions ?? 0),
    },
  };
}

export function budgetExhausted(scheduler: SchedulerRecord, spec: SpecRecord): string | undefined {
  if (spec.budgets.maxCostUsd !== undefined && scheduler.spend.costUsd >= spec.budgets.maxCostUsd) {
    return "cost budget exhausted";
  }
  return undefined;
}

export function earliestWake(times: Array<string | undefined>): string | undefined {
  const known = times.filter((entry): entry is string => Boolean(entry)).sort();
  return known[0];
}
