/**
 * Reversibility, judged per action (D23).
 *
 * A coding agent gets this free from git: try it, and revert if it was wrong. The
 * browser has no revert, so the agent needs to know which actions it can experiment
 * with and which are permanent. That cannot be a property of the tool — "Show more"
 * and "Submit" are both clicks — so it is judged from the affordance: the accessible
 * name, whether the control submits a form, and where a link leads.
 *
 * The judgment is fallible, so the default direction matters: unknown resolves to
 * `committing`. Over-asking wastes a human's minute; an accidental submit cannot be
 * taken back.
 */

import type { ActionRequest, Control, Reversibility } from "./types.ts";

export interface Classification {
  reversibility: Reversibility;
  reason: string;
}

export interface ClassifierRule {
  id: string;
  reversibility: Reversibility;
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
  /\b(show|expand|collapse|more|less|filter|sort|search|view|details|next page|previous page|next|previous|back|toggle|open|close|menu|tab|preview|refresh|reload|select|choose|edit|add another)\b/i;

/** Abandon paths. Ambiguous on purpose: cancelling is not reliably side-effect free. */
const ABANDON = /\b(cancel|discard|dismiss|abandon|reset|clear)\b/i;

export const CLASSIFIER_RULES: ClassifierRule[] = [
  {
    id: "read-only-kind",
    reversibility: "probe",
    reason: "read-only action",
    test: (request) => request.kind === "check",
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
    reversibility: "committing",
    reason: "the control name describes a destructive action",
    test: (_request, control) => Boolean(control && DESTRUCTIVE.test(control.name)),
  },
  {
    id: "outbound-name",
    reversibility: "committing",
    reason: "the control name describes sending or publishing something",
    test: (request, control) =>
      request.kind === "click" && Boolean(control && OUTBOUND.test(control.name)),
  },
  {
    id: "submits-form",
    reversibility: "committing",
    reason: "activating this control submits a form",
    test: (request, control) => request.kind === "click" && Boolean(control?.submits),
  },
  {
    id: "abandon-name",
    reversibility: "committing",
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

export function classifyAction(
  request: ActionRequest,
  control: Control | undefined,
): Classification {
  for (const rule of CLASSIFIER_RULES) {
    if (rule.test(request, control)) {
      return { reversibility: rule.reversibility, reason: `${rule.reason} (${rule.id})` };
    }
  }
  if (request.ref && !control) {
    return {
      reversibility: "committing",
      reason: "target could not be described, so its effect is unknown (unknown-target)",
    };
  }
  return {
    reversibility: "committing",
    reason: control?.name
      ? `no rule matched "${control.name}", so its effect is unknown (unmatched)`
      : "the control has no name, so its effect is unknown (unnamed)",
  };
}
