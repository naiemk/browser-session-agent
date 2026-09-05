/**
 * The single action choke point.
 *
 * Every mutation goes through `act`, and `act` always evaluates a postcondition.
 * Verification is therefore skipped by construction, not by discipline: there is no
 * code path that performs an action without checking whether it did anything.
 */

import { visibleText } from "./perceive.ts";
import { evaluatePredicate, verify } from "./predicates.ts";
import { describeVerification, settleVerification, DEFAULT_SETTLE_MS } from "./settle.ts";
import type { BrowserPort } from "./browser.ts";
import type { LedgerSink } from "./ledger.ts";
import { classifyAction, type Classification } from "./reversibility.ts";
import {
  CoreError,
  type ActionRequest,
  type ActionResult,
  type Control,
  type FailureBundle,
  type Observation,
  type PageFacts,
  type Predicate,
  type Verification,
} from "./types.ts";

export type Classifier = (request: ActionRequest, control: Control | undefined) => Classification;

export interface ActOptions {
  classify?: Classifier;
  /** Directory for on-failure screenshots. Omitted means no screenshot. */
  screenshotDir?: string;
  timeoutMs?: number;
  /** When set, every action is traced: intent, before, action, after, outcome. */
  ledger?: LedgerSink;
  entityId?: string;
  /**
   * How long a failing postcondition is given to become true before it is believed.
   * Zero means judge the first look, which is only useful for proving the race exists.
   */
  settleMs?: number;
}

export const MAX_RECOVERY_CHARS = 600;

export async function act(
  browser: BrowserPort,
  request: ActionRequest,
  options: ActOptions = {},
): Promise<ActionResult> {
  const classify = options.classify ?? classifyAction;
  const timeout = options.timeoutMs ?? 10_000;

  const before = await browser.observe(request.tabId);
  const control = request.ref
    ? before.controls.find((candidate) => candidate.ref === request.ref)
    : undefined;

  if (request.ref && !control) {
    throw new CoreError("missing_ref", `No control with ref ${request.ref}`, {
      ref: request.ref,
      available: before.controls.map((candidate) => candidate.ref),
    });
  }

  const classification = classify(request, control);

  // Perform, through the port's primitives. Everything that decides *meaning* stays
  // here; the port only knows how to poke a browser.
  switch (request.kind) {
    case "navigate": {
      if (!request.url) throw new CoreError("bad_request", "navigate needs a url");
      await browser.navigate(request.tabId, request.url, timeout);
      break;
    }
    case "click": {
      await browser.click(request.tabId, request.ref!, timeout);
      break;
    }
    case "type": {
      await browser.fill(request.tabId, request.ref!, request.text ?? "", timeout);
      break;
    }
    case "select": {
      await browser.selectOption(request.tabId, request.ref!, request.value ?? "", timeout);
      break;
    }
    case "scroll": {
      await browser.scroll(request.tabId, request.ref, request.dy, timeout);
      break;
    }
    case "upload": {
      await browser.setInputFiles(request.tabId, request.ref!, request.files ?? [], timeout);
      break;
    }
    case "wait": {
      const spec = request.wait ?? { kind: "timeout", timeoutMs: 500 };
      await browser.waitFor(request.tabId, spec, Math.min(spec.timeoutMs ?? timeout, 15_000));
      break;
    }
    case "check": {
      // No mutation; the postcondition below is the entire point of the call.
      break;
    }
  }

  const { facts, verification } = await settleVerification(
    browser,
    (settled) =>
      request.expect
        ? verify([request.expect], settled)
        : defaultPostcondition(request, before, settled, control),
    { tabId: request.tabId, since: before, budgetMs: options.settleMs ?? DEFAULT_SETTLE_MS },
  );

  const result: ActionResult = {
    ok: verification.status === "passed",
    kind: request.kind,
    reversibility: classification.reversibility,
    reversibilityReason: classification.reason,
    observation: facts.observation,
    verification,
  };

  if (!result.ok) {
    result.failure = await buildFailure(browser, request, facts, verification, options);
  }

  // One event per action, carrying the whole story including the failure bundle, so a
  // trace is diagnosable without the model transcript.
  await options.ledger?.append({
    type: result.ok ? "action" : "failure",
    entityId: options.entityId,
    intent: request.intent ?? `${request.kind} ${request.ref ?? request.url ?? ""}`.trim(),
    before: {
      url: before.url,
      title: before.title,
      controls: before.controls.length,
      ...(before.truncated ? { truncated: true as const } : {}),
    },
    action: {
      kind: request.kind,
      ref: request.ref,
      url: request.url,
      reversibility: classification.reversibility,
      reversibilityReason: classification.reason,
    },
    after: {
      url: facts.observation.url,
      title: facts.observation.title,
      changes: facts.observation.changes,
    },
    outcome: {
      ok: result.ok,
      detail: describeVerification(verification),
    },
    payload: result.failure ? { failure: result.failure } : undefined,
    artifacts: result.failure?.screenshot ? [result.failure.screenshot] : undefined,
  });

  return result;
}

/**
 * What "it worked" means when the caller gave no explicit expectation.
 * A click that changes nothing is a failure — the single most common way a browser
 * agent fools itself.
 */
function defaultPostcondition(
  request: ActionRequest,
  before: Observation,
  facts: PageFacts,
  control: Control | undefined,
): Verification {
  const after = facts.observation;
  switch (request.kind) {
    case "click": {
      const changed =
        after.changes.length > 0 ||
        before.url !== after.url ||
        before.title !== after.title ||
        before.dialogs.join("\n") !== after.dialogs.join("\n") ||
        before.errors.join("\n") !== after.errors.join("\n");
      return single(
        changed,
        "pageDelta",
        changed
          ? after.changes.join("; ") || after.url
          : "noop click: nothing on the page changed",
      );
    }
    case "type":
    case "select": {
      const wanted = request.kind === "type" ? (request.text ?? "") : (request.value ?? "");
      const updated = after.controls.find((candidate) => candidate.ref === request.ref);
      if (control?.inputType === "password") {
        return single(true, "readBack", "password redacted");
      }
      const actual = updated?.value ?? "";
      const passed =
        actual === wanted || actual.toLowerCase().includes(wanted.toLowerCase()) || wanted === "";
      return single(passed, "readBack", passed ? actual : `expected "${wanted}", read "${actual}"`);
    }
    case "navigate": {
      const target = request.url ?? "";
      const passed = urlMatchesIntent(after.url, target);
      return single(passed, "urlIntent", passed ? after.url : `expected ${target}, got ${after.url}`);
    }
    case "upload": {
      const updated = after.controls.find((candidate) => candidate.ref === request.ref);
      const expected = (request.files ?? []).map((file) => file.split("/").pop() ?? file);
      const actual = updated?.value ?? "";
      const passed = expected.length === 0 || expected.some((name) => actual.includes(name));
      return single(passed, "fileAttached", passed ? actual : `expected ${expected.join(",")}, read "${actual}"`);
    }
    default:
      return single(true, request.kind, `${request.kind} completed`);
  }
}

function single(passed: boolean, name: string, detail: string): Verification {
  return { status: passed ? "passed" : "failed", checks: [{ passed, detail, predicate: name }] };
}

function urlMatchesIntent(actual: string, target: string): boolean {
  if (!target) return false;
  try {
    const want = new URL(target);
    const got = new URL(actual);
    if (got.host !== want.host) return false;
    const path = want.pathname.replace(/\/$/, "");
    if (!path || path === "") return true;
    return got.pathname.startsWith(path) || actual.includes(path);
  } catch {
    return actual.includes(target);
  }
}

async function buildFailure(
  browser: BrowserPort,
  request: ActionRequest,
  facts: PageFacts,
  verification: Verification,
  options: ActOptions,
): Promise<FailureBundle> {
  const failed = verification.checks.filter((check) => !check.passed);
  const detail =
    failed.map((check) => check.detail).join(" | ") ||
    `action did not meet expectations at ${facts.url}`;
  // How long we waited belongs in the recovery text: "has not happened yet" and "is not
  // going to happen" read identically without it, and they call for different next moves.
  const waited = verification.waitedMs ?? 0;
  const recovery = (
    waited > 0 ? `${detail} (still failing ${waited}ms after the action)` : detail
  ).slice(0, MAX_RECOVERY_CHARS);

  let screenshot: string | undefined;
  if (options.screenshotDir) {
    screenshot = `${options.screenshotDir}/${facts.observation.id}.png`;
    await browser.screenshot(request.tabId, screenshot).catch(() => {
      screenshot = undefined;
    });
  }

  return {
    recovery,
    changes: facts.observation.changes,
    consoleErrors: facts.observation.consoleErrors,
    failedRequests: facts.observation.failedRequests,
    screenshot,
  };
}

/**
 * Evaluate a predicate against the live page without mutating anything.
 *
 * Settles like a postcondition does, for the same reason: a check issued straight after
 * something asynchronous would otherwise report the page as it was a moment ago. An
 * assertion that is genuinely false pays the full wait, which costs latency and no
 * tokens — the cheaper of the two ways to be wrong.
 */
export async function check(
  browser: BrowserPort,
  predicate: Predicate,
  tabId?: string,
  settleMs = DEFAULT_SETTLE_MS,
): Promise<Verification> {
  const { verification } = await settleVerification(
    browser,
    (facts) => {
      const result = evaluatePredicate(predicate, facts);
      return { status: result.passed ? "passed" : "failed", checks: [result] };
    },
    // No `since`: predicates read the page, never what changed on it, so a check stays
    // at one read on the happy path.
    { tabId, budgetMs: settleMs },
  );
  return verification;
}

export { visibleText };
