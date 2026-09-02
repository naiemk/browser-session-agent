/**
 * The single action choke point.
 *
 * Every mutation goes through `act`, and `act` always evaluates a postcondition.
 * Verification is therefore skipped by construction, not by discipline: there is no
 * code path that performs an action without checking whether it did anything.
 */

import { refSelector, visibleText } from "./perceive.ts";
import { evaluatePredicate, verify } from "./predicates.ts";
import type { BrowserPort } from "./browser.ts";
import type { Ledger } from "./ledger.ts";
import {
  CoreError,
  type ActionRequest,
  type ActionResult,
  type Control,
  type FailureBundle,
  type Observation,
  type PageFacts,
  type Predicate,
  type Reversibility,
  type Verification,
} from "./types.ts";

export interface Classification {
  reversibility: Reversibility;
  reason: string;
}

export type Classifier = (request: ActionRequest, control: Control | undefined) => Classification;

/**
 * Conservative placeholder. AGENT-05-T01 replaces this with the real per-action
 * judgment; until then anything that submits is treated as committing, which is the
 * safe direction per D23.
 */
export const conservativeClassifier: Classifier = (request, control) => {
  if (request.kind === "navigate") {
    return { reversibility: "navigational", reason: "navigation replaces page state" };
  }
  if (request.kind === "wait" || request.kind === "scroll" || request.kind === "check") {
    return { reversibility: "reversible", reason: `${request.kind} does not mutate` };
  }
  if (control?.submits) {
    return { reversibility: "committing", reason: `"${control.name}" submits a form` };
  }
  if (request.kind === "type" || request.kind === "select") {
    return { reversibility: "reversible", reason: `${request.kind} can be overwritten` };
  }
  return { reversibility: "committing", reason: "unclassified action, treated as committing" };
};

export interface ActOptions {
  classify?: Classifier;
  /** Directory for on-failure screenshots. Omitted means no screenshot. */
  screenshotDir?: string;
  timeoutMs?: number;
  /** When set, every action is traced: intent, before, action, after, outcome. */
  ledger?: Ledger;
  entityId?: string;
}

export const MAX_RECOVERY_CHARS = 600;

export async function act(
  browser: BrowserPort,
  request: ActionRequest,
  options: ActOptions = {},
): Promise<ActionResult> {
  const classify = options.classify ?? conservativeClassifier;
  const timeout = options.timeoutMs ?? 10_000;
  const page = browser.pageFor(request.tabId);

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

  switch (request.kind) {
    case "navigate": {
      if (!request.url) throw new CoreError("bad_request", "navigate needs a url");
      await page.goto(request.url, { waitUntil: "domcontentloaded", timeout });
      break;
    }
    case "click": {
      await page.locator(refSelector(request.ref!)).first().click({ timeout });
      break;
    }
    case "type": {
      const locator = page.locator(refSelector(request.ref!)).first();
      await locator.fill(request.text ?? "", { timeout });
      break;
    }
    case "select": {
      await page
        .locator(refSelector(request.ref!))
        .first()
        .selectOption(request.value ?? "", { timeout });
      break;
    }
    case "scroll": {
      if (request.ref && request.dy) {
        // Scroll *within* the referenced container: hover it, then wheel. This is what
        // a virtualized listbox needs; scrollIntoViewIfNeeded cannot reach unrendered rows.
        await page.locator(refSelector(request.ref)).first().hover({ timeout });
        await page.mouse.wheel(0, request.dy);
      } else if (request.ref) {
        await page.locator(refSelector(request.ref)).first().scrollIntoViewIfNeeded({ timeout });
      } else {
        await page.mouse.wheel(0, request.dy ?? 600);
      }
      break;
    }
    case "upload": {
      await page
        .locator(refSelector(request.ref!))
        .first()
        .setInputFiles(request.files ?? [], { timeout });
      break;
    }
    case "wait": {
      await performWait(page, request, timeout);
      break;
    }
    case "check": {
      // No mutation; the postcondition below is the entire point of the call.
      break;
    }
  }

  const facts = await browser.facts(request.tabId);
  const verification = request.expect
    ? verify([request.expect], facts)
    : defaultPostcondition(request, before, facts, control);

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
    before: { url: before.url, title: before.title, controls: before.controls.length },
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
      detail: verification.checks.map((check) => `${check.predicate}: ${check.detail}`).join("; "),
    },
    payload: result.failure ? { failure: result.failure } : undefined,
    artifacts: result.failure?.screenshot ? [result.failure.screenshot] : undefined,
  });

  return result;
}

async function performWait(
  page: import("playwright").Page,
  request: ActionRequest,
  timeout: number,
): Promise<void> {
  const spec = request.wait ?? { kind: "timeout", timeoutMs: 500 };
  const waitMs = Math.min(spec.timeoutMs ?? timeout, 15_000);
  switch (spec.kind) {
    case "load":
      await page.waitForLoadState("domcontentloaded", { timeout: waitMs });
      return;
    case "url":
      await page.waitForURL((url) => url.href.includes(spec.value ?? ""), { timeout: waitMs });
      return;
    case "text":
      await page.getByText(spec.value ?? "", { exact: false }).first().waitFor({ timeout: waitMs });
      return;
    case "ref":
      await page.locator(refSelector(spec.value ?? "")).first().waitFor({ timeout: waitMs });
      return;
    case "timeout":
      await page.waitForTimeout(waitMs);
      return;
  }
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
  const recovery = (
    failed.map((check) => check.detail).join(" | ") ||
    `action did not meet expectations at ${facts.url}`
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

/** Evaluate a predicate against the live page without mutating anything. */
export async function check(
  browser: BrowserPort,
  predicate: Predicate,
  tabId?: string,
): Promise<Verification> {
  const facts = await browser.facts(tabId);
  const result = evaluatePredicate(predicate, facts);
  return { status: result.passed ? "passed" : "failed", checks: [result] };
}

export { visibleText };
