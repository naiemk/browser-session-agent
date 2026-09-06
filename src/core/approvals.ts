/**
 * Operator approvals that stick for the rest of a goal (D23, D25).
 *
 * The gate used to ask again every turn: yes was an ephemeral callback return, and the
 * next identical click parked as if nobody had spoken. The operator approved a *named
 * action on a host*, not a snapshot ref, so the key is host + kind + name + the rule
 * that classified it. A remembered selector still cannot authorize a commit (D25); this
 * is the human's decision, written on the ledger so a cold resume can reconstruct it.
 */

import type { LedgerEvent } from "./ledger.ts";

export interface ApprovalIdentity {
  host: string;
  kind: string;
  name: string;
  ruleId: string;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function normalizeControlName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

export function approvalKey(identity: ApprovalIdentity): string {
  return [identity.host, identity.kind, normalizeControlName(identity.name), identity.ruleId].join(
    "\u001f",
  );
}

function payloadIdentity(payload: Record<string, unknown> | undefined): ApprovalIdentity | undefined {
  if (!payload) return undefined;
  const host = typeof payload.host === "string" ? payload.host : "";
  const kind = typeof payload.controlKind === "string" ? payload.controlKind : "";
  const name = typeof payload.controlName === "string" ? payload.controlName : "";
  const ruleId = typeof payload.ruleId === "string" ? payload.ruleId : "";
  if (!host || !kind || !name || !ruleId) return undefined;
  return { host, kind, name, ruleId };
}

/** True when this ledger row is an operator yes we should honour later. */
export function isStickyApproval(event: LedgerEvent): boolean {
  if (event.type !== "approval") return false;
  if (event.outcome?.ok !== true) return false;
  const detail = event.outcome.detail ?? "";
  // Auto-policy is not an operator decision; it must not suppress later asks.
  return detail === "approved by user" || detail === "approval remembered";
}

/** Rebuild the set a cold resume can consult, from the ledger alone. */
export function approvalsFromEvents(events: readonly LedgerEvent[]): Set<string> {
  const keys = new Set<string>();
  for (const event of events) {
    if (!isStickyApproval(event)) continue;
    const identity = payloadIdentity(event.payload);
    if (identity) keys.add(approvalKey(identity));
  }
  return keys;
}
