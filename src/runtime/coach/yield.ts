/**
 * Yield events: semantic progress a coach can count.
 *
 * AGENT-15 no-progress is failed/stagnant actions. Coaching is wasted *successful*
 * wandering. A click that returned `ok` is not yield unless one of these is recorded.
 *
 * COACH-03.
 */

import type { LedgerInput } from "../../core/ledger.ts";

export const YIELD_KINDS = [
  "candidate_accepted",
  "candidate_rejected",
  "candidate_duplicate",
  "fact_established",
  "route_affordance",
  "lost_place",
] as const;

export type YieldKind = (typeof YIELD_KINDS)[number];

export function isYieldKind(value: unknown): value is YieldKind {
  return typeof value === "string" && (YIELD_KINDS as readonly string[]).includes(value);
}

export interface YieldWrite {
  kind: YieldKind;
  summary: string;
  reason?: string;
  pageIdentity?: string;
  entityId?: string;
}

export function yieldInput(input: YieldWrite): LedgerInput {
  const summary = input.summary.trim().slice(0, 400);
  return {
    type: "yield",
    entityId: input.entityId,
    intent: `${input.kind}: ${summary}`,
    outcome: { ok: true, detail: (input.reason ?? summary).slice(0, 400) },
    payload: {
      kind: input.kind,
      ...(input.reason ? { reason: input.reason.trim().slice(0, 200) } : {}),
      ...(input.pageIdentity ? { pageIdentity: input.pageIdentity } : {}),
    },
  };
}

export function yieldKindOf(event: { type?: string; payload?: Record<string, unknown> }): YieldKind | undefined {
  if (event.type !== "yield") return undefined;
  return isYieldKind(event.payload?.kind) ? event.payload.kind : undefined;
}
