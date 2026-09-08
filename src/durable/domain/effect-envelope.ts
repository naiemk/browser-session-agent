import type { NondelegableCategory } from "./spec-types.ts";
import type { EffectEnvelope } from "./spec-types.ts";

export type GateDecision =
  | { decision: "allow"; grantId?: string }
  | { decision: "ask"; reason: string }
  | { decision: "deny"; reason: string; category?: NondelegableCategory };

export interface EffectIntent {
  effect: string;
  host?: string;
  controlName?: string;
  category?: NondelegableCategory | "outbound" | "navigation" | "other";
}

/**
 * SPEC-06 / EFFECT-03 — typed neverPreapprove mapping, not list presence alone.
 * Bans submits-form / apply-alone as outbound authorization.
 */
export function decideEffectAuthorization(
  envelope: EffectEnvelope,
  intent: EffectIntent,
  remainingByGrant: Record<string, number>,
  nowIso: string,
): GateDecision {
  const category = intent.category;
  if (
    category === "destructive" ||
    category === "payment" ||
    category === "credential" ||
    category === "otp" ||
    category === "captcha"
  ) {
    if (envelope.neverPreapprove.includes(category)) {
      return { decision: "deny", reason: `nondelegable:${category}`, category };
    }
  }

  if (envelope.denied.includes(intent.effect) || (category && envelope.denied.includes(category))) {
    return { decision: "deny", reason: `denied:${intent.effect}` };
  }

  const weakOutbound =
    intent.controlName &&
    /^(submit|apply|filter|search|continue)$/i.test(intent.controlName) &&
    (category === "outbound" || intent.effect === "outbound");
  if (weakOutbound) {
    return { decision: "ask", reason: "weak_control_name_not_sticky" };
  }

  const grant = envelope.grants.find((g) => {
    if (g.effect !== intent.effect) return false;
    if (intent.host && g.host && g.host !== intent.host) return false;
    if (g.controlName && intent.controlName && g.controlName !== intent.controlName) return false;
    if (g.expiresAt && g.expiresAt < nowIso) return false;
    return (remainingByGrant[g.id] ?? g.maxCount) > 0;
  });

  if (grant) return { decision: "allow", grantId: grant.id };

  const allowed = envelope.allowed.some((a) => {
    if (a.effect !== intent.effect) return false;
    if (intent.host && a.hosts && !a.hosts.includes(intent.host)) return false;
    return true;
  });
  if (allowed) return { decision: "ask", reason: "allowed_but_ungranted" };

  return { decision: "ask", reason: "uncovered_effect" };
}
