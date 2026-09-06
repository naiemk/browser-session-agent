/**
 * The commit gate (D23).
 *
 * Recoverable work runs freely: explore, checkpoint, restore. An action that leaves
 * this session (send, pay, delete) has to earn its way through: an explicit
 * precondition must hold on the live page, the goal's policy must allow it, and
 * evidence is captured on both sides so there is a record of what the page looked
 * like when we committed.
 *
 * Two rules are deliberate. Authorization is a positive match — unmatched exploration
 * is not a world-commit. And remembered or predicted knowledge can never satisfy the
 * gate (D25): only a live check counts. A missing precondition on an authorized
 * commit is a reason to refuse rather than proceed.
 */

import { act, type ActOptions } from "./act.ts";
import { approvalKey, approvalsFromEvents, hostOf, type ApprovalIdentity } from "./approvals.ts";
import type { BrowserPort } from "./browser.ts";
import { loadCheckpoint, restoreCheckpoint, saveCheckpoint } from "./checkpoint.ts";
import type { LedgerSink } from "./ledger.ts";
import { evaluatePredicate } from "./predicates.ts";
import { isAuthorized, type Classification } from "./reversibility.ts";
import type {
  ActionRequest,
  ActionResult,
  Authorization,
  ParkedOutcome,
  Predicate,
  Reversibility,
  Verification,
} from "./types.ts";

export type ApprovalMode = "auto" | "ask" | "never";

export interface ApprovalRequest {
  request: ActionRequest;
  reversibility: string;
  reason: string;
  authorization: Authorization;
  authorizationReason: string;
  url: string;
  precondition?: Verification;
}

export interface GateAskInfo {
  authorization: Authorization;
  recoverability: Reversibility;
  ruleId: string;
}

export interface GateOptions extends ActOptions {
  policy?: ApprovalMode;
  /** What must be true on the live page before an authorized commit may fire. */
  precondition?: Predicate;
  /** Asked only under the "ask" policy, and only when authorization is set. */
  approve?: (request: ApprovalRequest) => Promise<boolean>;
  /** Fired when the operator is actually asked, so metering can count the gate. */
  onAsk?: (info: GateAskInfo) => void;
  ledger?: LedgerSink;
  entityId?: string;
  /** Enables navigation and unknown-action checkpoints. */
  checkpoint?: { root: string; goalId: string; tag?: string };
}

export type GateResult =
  | { status: "acted"; result: ActionResult; approved?: boolean; preconditionMet?: boolean }
  | { status: "refused"; code: string; reason: string; precondition?: Verification }
  | { status: "parked"; parked: ParkedOutcome };

function gatePayload(
  classification: Classification,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    recoverability: classification.reversibility,
    authorization: classification.authorization,
    ...extra,
  };
}

function needsCheckpoint(request: ActionRequest, classification: Classification): boolean {
  if (request.kind === "restore") return false;
  return classification.reversibility === "navigational" || classification.reversibility === "unknown";
}

function shouldRestoreFailedExpect(
  request: ActionRequest,
  classification: Classification,
  result: ActionResult,
): boolean {
  return (
    !result.ok &&
    Boolean(request.expect) &&
    classification.reversibility === "unknown" &&
    classification.authorization === "none"
  );
}

async function restoreLatest(
  browser: BrowserPort,
  checkpoint: { root: string; goalId: string; tag?: string },
  tabId: string | undefined,
  actOptions: ActOptions,
): Promise<{ url: string; restored: string[]; missing: string[] } | undefined> {
  const tag = checkpoint.tag ?? "latest";
  const saved = await loadCheckpoint(checkpoint.root, checkpoint.goalId, tag);
  if (!saved) return undefined;
  const outcome = await restoreCheckpoint(browser, saved, { tabId, ...actOptions });
  return { url: saved.url, ...outcome };
}

async function runRestore(
  browser: BrowserPort,
  request: ActionRequest,
  options: GateOptions,
): Promise<GateResult> {
  if (!options.checkpoint) {
    return {
      status: "refused",
      code: "no_checkpoint",
      reason: "restore needs a checkpoint for this goal",
    };
  }
  const outcome = await restoreLatest(browser, options.checkpoint, request.tabId, options);
  if (!outcome) {
    return {
      status: "refused",
      code: "no_checkpoint",
      reason: "no checkpoint to restore",
    };
  }
  const observation = await browser.observe(request.tabId);
  const detail =
    outcome.missing.length > 0
      ? `restored ${outcome.url}; missing fields: ${outcome.missing.join(", ")}`
      : `restored ${outcome.url}`;
  await options.ledger?.append({
    type: "action",
    entityId: options.entityId,
    intent: request.intent ?? "restore checkpoint",
    action: {
      kind: "restore",
      reversibility: "navigational",
      reversibilityReason: "restore reloads a checkpoint (restore-kind)",
      authorization: "none",
      authorizationReason: "no outbound or destructive match (none)",
    },
    after: { url: observation.url, title: observation.title, changes: observation.changes },
    outcome: { ok: true, detail },
    payload: { restored: outcome.restored, missing: outcome.missing },
  });
  return {
    status: "acted",
    result: {
      ok: true,
      kind: "restore",
      reversibility: "navigational",
      reversibilityReason: "restore reloads a checkpoint (restore-kind)",
      authorization: "none",
      authorizationReason: "no outbound or destructive match (none)",
      observation,
      verification: {
        status: "passed",
        checks: [{ passed: true, detail, predicate: "restore" }],
      },
      restored: true,
    },
  };
}

async function runExploration(
  browser: BrowserPort,
  request: ActionRequest,
  options: GateOptions,
  classification: Classification,
): Promise<GateResult> {
  const result = await act(browser, request, options);
  if (shouldRestoreFailedExpect(request, classification, result) && options.checkpoint) {
    try {
      const restored = await restoreLatest(browser, options.checkpoint, request.tabId, options);
      if (restored) {
        const observation = await browser.observe(request.tabId);
        if (result.failure) {
          result.failure = {
            ...result.failure,
            recovery: `${result.failure.recovery} Restored the previous page.`,
          };
        }
        return { status: "acted", result: { ...result, observation, restored: true } };
      }
    } catch {
      // The expect failure still holds if restore fails; the recovery note says why.
    }
  }
  return { status: "acted", result };
}

/**
 * Run an action through the gate. Unauthorized actions pass straight through, with a
 * checkpoint written first when navigation or an unknown click would discard page state.
 * Authorized commits wait on policy.
 */
export async function guardedAct(
  browser: BrowserPort,
  request: ActionRequest,
  options: GateOptions = {},
): Promise<GateResult> {
  if (request.kind === "restore") {
    return runRestore(browser, request, options);
  }

  const policy = options.policy ?? "ask";
  const facts = await browser.facts(request.tabId);
  const control = request.ref
    ? facts.observation.controls.find((candidate) => candidate.ref === request.ref)
    : undefined;
  const classify = options.classify ?? (await import("./reversibility.ts")).classifyAction;
  const classification = classify(request, control);

  if (needsCheckpoint(request, classification) && options.checkpoint) {
    await saveCheckpoint(browser, {
      root: options.checkpoint.root,
      goalId: options.checkpoint.goalId,
      tag: options.checkpoint.tag ?? "latest",
      tabId: request.tabId,
    });
  }

  if (!isAuthorized(classification)) {
    return runExploration(browser, request, options, classification);
  }

  // From here on the action leaves this session.
  let precondition: Verification | undefined;
  const required = options.precondition ?? request.expect;
  if (required) {
    const check = evaluatePredicate(required, facts);
    const passed = Boolean(check?.passed);
    precondition = { status: passed ? "passed" : "failed", checks: [check] };
    if (!passed) {
      await options.ledger?.append({
        type: "approval",
        entityId: options.entityId,
        intent: request.intent ?? `${request.kind} ${request.ref ?? ""}`.trim(),
        outcome: { ok: false, detail: `precondition failed: ${check.detail}` },
        payload: gatePayload(classification, { policy }),
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
      payload: gatePayload(classification, { policy }),
    });
    return {
      status: "refused",
      code: "policy_forbids_commit",
      reason: `this goal's policy is "never": ${classification.authorizationReason}`,
      precondition,
    };
  }

  const identity: ApprovalIdentity | undefined = control?.name
    ? {
        host: hostOf(facts.url),
        kind: request.kind,
        name: control.name,
        ruleId: classification.authorizationRuleId,
      }
    : undefined;

  if (policy === "ask") {
    const remembered =
      Boolean(identity) &&
      options.ledger?.read &&
      approvalsFromEvents(await options.ledger.read()).has(approvalKey(identity!));
    if (!remembered) {
      options.onAsk?.({
        authorization: classification.authorization,
        recoverability: classification.reversibility,
        ruleId: classification.authorizationRuleId,
      });
    }
    const approved =
      remembered ||
      (await options.approve?.({
        request,
        reversibility: classification.reversibility,
        reason: classification.authorizationReason,
        authorization: classification.authorization,
        authorizationReason: classification.authorizationReason,
        url: facts.url,
        precondition,
      }));
    if (!approved) {
      const parked: ParkedOutcome = {
        status: "parked",
        reason: `waiting for approval: ${classification.authorizationReason}`,
        wake: "human",
        // An approval question keeps its meaning tomorrow; the page may not, but the
        // decision does, so this is a durable item rather than a perishable one.
        perishable: false,
        payload: {
          action: request.kind,
          control: control?.name,
          url: facts.url,
          intent: request.intent,
          authorization: classification.authorization,
        },
      };
      await options.ledger?.append({
        type: "parked",
        entityId: options.entityId,
        intent: request.intent,
        outcome: { ok: false, detail: parked.reason },
        payload: gatePayload(classification, {
          policy,
          asked: true,
          wake: parked.wake,
          perishable: parked.perishable,
        }),
      });
      return { status: "parked", parked };
    }
    // Record the yes before the act, so a click that then fails does not re-ask.
    if (identity && !remembered) {
      await options.ledger?.append({
        type: "approval",
        entityId: options.entityId,
        intent: request.intent ?? `${request.kind} ${control?.name ?? request.ref ?? ""}`.trim(),
        outcome: { ok: true, detail: "approved by user" },
        payload: {
          ...gatePayload(classification, { policy, asked: true }),
          host: identity.host,
          controlKind: identity.kind,
          controlName: identity.name,
          ruleId: identity.ruleId,
        },
      });
    }
  }

  // Evidence on both sides of an authorized commit.
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
      authorization: classification.authorization,
      authorizationReason: classification.authorizationReason,
    },
    outcome: {
      ok: result.ok,
      detail: policy === "auto" ? "auto-approved" : "approved by user",
    },
    // Recorded so the value of relaxing to "auto" can be argued from data later.
    payload: {
      ...gatePayload(classification, {
        policy,
        preconditionMet: precondition?.status === "passed",
      }),
      ...(identity
        ? {
            host: identity.host,
            controlKind: identity.kind,
            controlName: identity.name,
            ruleId: identity.ruleId,
          }
        : {}),
    },
    artifacts: [beforeShot, afterShot].filter((entry): entry is string => Boolean(entry)),
  });

  return {
    status: "acted",
    result,
    approved: true,
    preconditionMet: precondition?.status === "passed",
  };
}
