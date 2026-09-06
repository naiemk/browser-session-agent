/**
 * Recoverability and authorization, judged per action (D23).
 *
 * A coding agent gets recoverability free from git: try it, and revert if it was wrong.
 * The browser has no revert, so the agent needs to know which actions it can experiment
 * with and which leave the session. That cannot be a property of the tool — "Show more"
 * and "Submit" are both clicks — so it is judged from the affordance: the accessible
 * name, whether the control submits a form, and where a link leads.
 *
 * Two questions used to share one answer. Unknown name became `committing`, and
 * `committing` became a human confirm. Exploring a site is the job; classifier
 * ignorance belongs in the loop (checkpoint, try, restore). Authorization is a
 * positive match on send / pay / delete — unmatched is not authorized.
 */

import type { ActionRequest, Authorization, Control, Reversibility } from "./types.ts";

export interface Classification {
  /** Recoverability for the loop. Field name kept so call sites stay one choke point. */
  reversibility: Reversibility;
  reason: string;
  /** Stable id of the recoverability rule that fired. */
  ruleId: string;
  authorization: Authorization;
  authorizationReason: string;
  /** Stable id of the authorization rule; sticky approvals key on this, not unmatched. */
  authorizationRuleId: string;
}

export interface ClassifierRule {
  id: string;
  reversibility: Reversibility;
  reason: string;
  test: (request: ActionRequest, control: Control | undefined) => boolean;
}

export interface AuthorizationRule {
  id: string;
  authorization: Exclude<Authorization, "none">;
  reason: string;
  test: (request: ActionRequest, control: Control | undefined) => boolean;
}

/** Names that mean "this cannot be undone". */
const DESTRUCTIVE =
  /\b(delete|remove|revoke|deactivate|deregister|close account|terminate|erase|wipe|purge|unsubscribe|cancel (?:subscription|plan|membership|account|order))\b/i;

/** Names that mean "this leaves our control and reaches someone else". */
const OUTBOUND =
  /\b(send|publish|post|share|invite|submit|apply|confirm|checkout|pay|purchase|buy|order|transfer|withdraw|book|reserve)\b/i;

/** Names that only change what is on screen. */
const BENIGN =
  /\b(show|expand|collapse|more|less|filter|sort|search|view|details|next page|previous page|next|previous|back|toggle|open|close|dismiss|menu|tab|preview|refresh|reload|select|choose|edit|add another|maybe later|not now|skip|tags|following|followers|profile|avatar)\b/i;

/** Abandon paths. Ambiguous on purpose: cancelling is not reliably side-effect free. */
const ABANDON = /\b(cancel|discard|abandon|reset|clear)\b/i;

export const CLASSIFIER_RULES: ClassifierRule[] = [
  {
    id: "read-only-kind",
    reversibility: "probe",
    reason: "read-only action",
    test: (request) => request.kind === "check",
  },
  {
    id: "restore-kind",
    reversibility: "navigational",
    reason: "restore reloads a checkpoint",
    test: (request) => request.kind === "restore",
  },
  {
    id: "non-mutating-kind",
    reversibility: "reversible",
    reason: "does not change page state",
    test: (request) => request.kind === "wait" || request.kind === "scroll",
  },
  {
    id: "navigate-kind",
    reversibility: "navigational",
    reason: "navigation replaces page state",
    test: (request) => request.kind === "navigate",
  },
  {
    id: "destructive-name",
    reversibility: "unknown",
    reason: "the control name describes a destructive action",
    test: (_request, control) => Boolean(control && DESTRUCTIVE.test(control.name)),
  },
  {
    id: "outbound-name",
    reversibility: "unknown",
    reason: "the control name describes sending or publishing something",
    test: (request, control) =>
      request.kind === "click" && Boolean(control && OUTBOUND.test(control.name)),
  },
  {
    id: "submits-form",
    reversibility: "unknown",
    reason: "activating this control submits a form",
    test: (request, control) =>
      request.kind === "click" &&
      Boolean(control?.submits) &&
      // A Search button often submits a GET form. That is a view change, not a commit.
      !BENIGN.test(control?.name ?? ""),
  },
  {
    id: "abandon-name",
    reversibility: "unknown",
    reason: "abandoning is not reliably side-effect free; it may leave a draft",
    test: (request, control) =>
      request.kind === "click" && Boolean(control && ABANDON.test(control.name)),
  },
  {
    id: "text-entry",
    reversibility: "reversible",
    reason: "typed input can be overwritten",
    test: (request) =>
      request.kind === "type" || request.kind === "select" || request.kind === "upload",
  },
  {
    id: "cross-origin-link",
    reversibility: "navigational",
    reason: "the link leaves this page",
    test: (request, control) =>
      request.kind === "click" && control?.tag === "a" && Boolean(control.href),
  },
  {
    id: "benign-name",
    reversibility: "reversible",
    reason: "the control name describes a view change",
    test: (request, control) =>
      request.kind === "click" && Boolean(control && BENIGN.test(control.name)),
  },
];

export const AUTHORIZATION_RULES: AuthorizationRule[] = [
  {
    id: "destructive-name",
    authorization: "destructive",
    reason: "the control name describes a destructive action",
    test: (_request, control) => Boolean(control && DESTRUCTIVE.test(control.name)),
  },
  {
    id: "outbound-name",
    authorization: "outbound",
    reason: "the control name describes sending or publishing something",
    test: (request, control) =>
      request.kind === "click" && Boolean(control && OUTBOUND.test(control.name)),
  },
  {
    id: "submits-form",
    authorization: "outbound",
    reason: "activating this control submits a form",
    test: (request, control) =>
      request.kind === "click" &&
      Boolean(control?.submits) &&
      !BENIGN.test(control?.name ?? ""),
  },
];

export function isAuthorized(classification: Classification): boolean {
  return classification.authorization !== "none";
}

function recoverabilityOf(
  request: ActionRequest,
  control: Control | undefined,
): Pick<Classification, "reversibility" | "reason" | "ruleId"> {
  for (const rule of CLASSIFIER_RULES) {
    if (rule.test(request, control)) {
      return {
        reversibility: rule.reversibility,
        reason: `${rule.reason} (${rule.id})`,
        ruleId: rule.id,
      };
    }
  }
  if (request.ref && !control) {
    return {
      reversibility: "unknown",
      reason: "target could not be described, so its effect is unknown (unknown-target)",
      ruleId: "unknown-target",
    };
  }
  return {
    reversibility: "unknown",
    reason: control?.name
      ? `no rule matched "${control.name}", so its effect is unknown (unmatched)`
      : "the control has no name, so its effect is unknown (unnamed)",
    ruleId: control?.name ? "unmatched" : "unnamed",
  };
}

function authorizationOf(
  request: ActionRequest,
  control: Control | undefined,
): Pick<Classification, "authorization" | "authorizationReason" | "authorizationRuleId"> {
  for (const rule of AUTHORIZATION_RULES) {
    if (rule.test(request, control)) {
      return {
        authorization: rule.authorization,
        authorizationReason: `${rule.reason} (${rule.id})`,
        authorizationRuleId: rule.id,
      };
    }
  }
  return {
    authorization: "none",
    authorizationReason: "no outbound or destructive match (none)",
    authorizationRuleId: "none",
  };
}

export function classifyAction(
  request: ActionRequest,
  control: Control | undefined,
): Classification {
  return {
    ...recoverabilityOf(request, control),
    ...authorizationOf(request, control),
  };
}
