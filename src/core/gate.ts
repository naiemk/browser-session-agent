/**
 * The commit gate (D23).
 *
 * Reversible work runs freely. An irreversible action has to earn its way through:
 * an explicit precondition must hold on the live page, the goal's policy must allow
 * it, and evidence is captured on both sides so there is a record of what the page
 * looked like when we committed.
 *
 * Two rules are deliberate. A missing precondition is treated as a reason to ask
 * rather than a reason to proceed, because "nobody said what should be true first"
 * is exactly when an agent submits the wrong thing. And remembered or predicted
 * knowledge can never satisfy the gate (D25): only a live check counts.
 */

import { act, type ActOptions } from "./act.ts";
import type { BrowserPort } from "./browser.ts";
import { saveCheckpoint } from "./checkpoint.ts";
import type { Ledger } from "./ledger.ts";
import { evaluatePredicate } from "./predicates.ts";
import type {
  ActionRequest,
  ActionResult,
  ParkedOutcome,
  Predicate,
  Verification,
} from "./types.ts";

export type ApprovalMode = "auto" | "ask" | "never";

export interface ApprovalRequest {
  request: ActionRequest;
  reversibility: string;
  reason: string;
  url: string;
  precondition?: Verification;
}

export interface GateOptions extends ActOptions {
  policy?: ApprovalMode;
  /** What must be true on the live page before this action may fire. */
  precondition?: Predicate;
  /** Asked only under the "ask" policy. Returning false parks the action. */
  approve?: (request: ApprovalRequest) => Promise<boolean>;
  ledger?: Ledger;
  entityId?: string;
  /** Enables navigation checkpoints. */
  checkpoint?: { root: string; goalId: string; tag?: string };
}

export type GateResult =
  | { status: "acted"; result: ActionResult; approved?: boolean; preconditionMet?: boolean }
  | { status: "refused"; code: string; reason: string; precondition?: Verification }
  | { status: "parked"; parked: ParkedOutcome };

/**
 * Run an action through the gate. Non-committing actions pass straight through,
 * with a checkpoint written first when navigation would discard page state.
 */
export async function guardedAct(
  browser: BrowserPort,
  request: ActionRequest,
  options: GateOptions = {},
): Promise<GateResult> {
  const policy = options.policy ?? "ask";
  const facts = await browser.facts(request.tabId);
  const control = request.ref
    ? facts.observation.controls.find((candidate) => candidate.ref === request.ref)
    : undefined;
  const classify = options.classify ?? (await import("./reversibility.ts")).classifyAction;
  const classification = classify(request, control);

  if (classification.reversibility === "navigational" && options.checkpoint) {
    await saveCheckpoint(browser, {
      root: options.checkpoint.root,
      goalId: options.checkpoint.goalId,
      tag: options.checkpoint.tag ?? "latest",
      tabId: request.tabId,
    });
  }

  if (classification.reversibility !== "committing") {
    return { status: "acted", result: await act(browser, request, options) };
  }

  // From here on the action is permanent.
  let precondition: Verification | undefined;
  if (options.precondition) {
    const check = evaluatePredicate(options.precondition, facts);
    precondition = { status: check.passed ? "passed" : "failed", checks: [check] };
    if (!check.passed) {
      await options.ledger?.append({
        type: "approval",
        entityId: options.entityId,
        intent: request.intent ?? `${request.kind} ${request.ref ?? ""}`.trim(),
        outcome: { ok: false, detail: `precondition failed: ${check.detail}` },
        payload: { policy, reversibility: classification.reversibility },
      });
      return {
        status: "refused",
        code: "precondition_failed",
        reason: `precondition not met: ${check.predicate} — ${check.detail}`,
        precondition,
      };
    }
  }

  if (policy === "never") {
    await options.ledger?.append({
      type: "approval",
      entityId: options.entityId,
      intent: request.intent,
      outcome: { ok: false, detail: "policy forbids irreversible actions" },
      payload: { policy, reversibility: classification.reversibility },
    });
    return {
      status: "refused",
      code: "policy_forbids_commit",
      reason: `this goal's policy is "never": ${classification.reason}`,
      precondition,
    };
  }

  if (policy === "ask") {
    const approved = await options.approve?.({
      request,
      reversibility: classification.reversibility,
      reason: classification.reason,
      url: facts.url,
      precondition,
    });
    if (!approved) {
      const parked: ParkedOutcome = {
        status: "parked",
        reason: `waiting for approval: ${classification.reason}`,
        wake: "human",
        // An approval question keeps its meaning tomorrow; the page may not, but the
        // decision does, so this is a durable item rather than a perishable one.
        perishable: false,
        payload: {
          action: request.kind,
          control: control?.name,
          url: facts.url,
          intent: request.intent,
        },
      };
      await options.ledger?.append({
        type: "parked",
        entityId: options.entityId,
        intent: request.intent,
        outcome: { ok: false, detail: parked.reason },
        payload: { policy, wake: parked.wake, perishable: parked.perishable },
      });
      return { status: "parked", parked };
    }
  }

  // Evidence on both sides of a permanent action.
  const beforeShot = options.screenshotDir
    ? `${options.screenshotDir}/commit-before-${facts.observation.id}.png`
    : undefined;
  if (beforeShot) await browser.screenshot(request.tabId, beforeShot).catch(() => undefined);

  const result = await act(browser, request, options);

  const afterShot = options.screenshotDir
    ? `${options.screenshotDir}/commit-after-${result.observation.id}.png`
    : undefined;
  if (afterShot) await browser.screenshot(request.tabId, afterShot).catch(() => undefined);

  await options.ledger?.append({
    type: "approval",
    entityId: options.entityId,
    intent: request.intent ?? `${request.kind} ${request.ref ?? ""}`.trim(),
    action: {
      kind: request.kind,
      ref: request.ref,
      reversibility: classification.reversibility,
      reversibilityReason: classification.reason,
    },
    outcome: { ok: result.ok, detail: policy === "auto" ? "auto-approved" : "approved by user" },
    // Recorded so the value of relaxing to "auto" can be argued from data later.
    payload: { policy, preconditionMet: precondition?.status === "passed" },
    artifacts: [beforeShot, afterShot].filter((entry): entry is string => Boolean(entry)),
  });

  return {
    status: "acted",
    result,
    approved: true,
    preconditionMet: precondition?.status === "passed",
  };
}
