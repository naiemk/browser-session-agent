import type { ActionName, Expectation, Observation, Verification, VerificationCheck } from "./types.ts";

export interface ActVerificationInput {
  action: ActionName;
  url?: string;
  ref?: string;
  text?: string;
  value?: string;
  expect?: Expectation;
}

export function evaluateExpectation(
  expectation: Expectation | undefined,
  observation: Observation,
  pageText: string,
): Verification {
  if (!expectation || Object.keys(expectation).length === 0) {
    return { status: "inconclusive", checks: [] };
  }

  const checks: VerificationCheck[] = [];

  if (expectation.urlIncludes !== undefined) {
    const passed = observation.url.includes(expectation.urlIncludes);
    checks.push({
      name: "urlIncludes",
      passed,
      detail: passed
        ? observation.url
        : `expected URL to include "${expectation.urlIncludes}", got ${observation.url}`,
    });
  }

  if (expectation.titleIncludes !== undefined) {
    const passed = observation.title.includes(expectation.titleIncludes);
    checks.push({
      name: "titleIncludes",
      passed,
      detail: passed
        ? observation.title
        : `expected title to include "${expectation.titleIncludes}", got ${observation.title}`,
    });
  }

  if (expectation.textVisible !== undefined) {
    const passed = pageText.includes(expectation.textVisible);
    checks.push({
      name: "textVisible",
      passed,
      detail: passed
        ? `visible: ${expectation.textVisible}`
        : `text not visible: "${expectation.textVisible}"`,
    });
  }

  if (expectation.refExists !== undefined) {
    const passed = observation.controls.some((c) => c.ref === expectation.refExists);
    checks.push({
      name: "refExists",
      passed,
      detail: passed
        ? expectation.refExists
        : `missing ref ${expectation.refExists}`,
    });
  }

  if (expectation.dialogOpen !== undefined) {
    const open = observation.dialogs.length > 0;
    const passed = open === expectation.dialogOpen;
    checks.push({
      name: "dialogOpen",
      passed,
      detail: open
        ? `dialogs: ${observation.dialogs.join("; ")}`
        : "no dialog open",
    });
  }

  if (expectation.noConsoleError) {
    const passed = observation.consoleErrors.length === 0;
    checks.push({
      name: "noConsoleError",
      passed,
      detail: passed ? "no console errors" : observation.consoleErrors.join("; "),
    });
  }

  const status = checks.every((c) => c.passed) ? "passed" : "failed";
  return { status, checks };
}

export function evaluateActVerification(
  input: ActVerificationInput,
  before: Observation | undefined,
  observation: Observation,
  pageText: string,
): Verification {
  if (input.expect && Object.keys(input.expect).length > 0) {
    return evaluateExpectation(input.expect, observation, pageText);
  }
  return evaluateDefaultPostcondition(input.action, input, before, observation);
}

export function evaluateDefaultPostcondition(
  action: ActionName,
  input: ActVerificationInput,
  before: Observation | undefined,
  observation: Observation,
): Verification {
  const checks: VerificationCheck[] = [];
  if (action === "type" || action === "select") {
    const wanted = action === "type" ? input.text ?? "" : input.value ?? "";
    const control = input.ref ? observation.controls.find((c) => c.ref === input.ref) : undefined;
    if (control?.inputType === "password") {
      checks.push({ name: "readBack", passed: true, detail: "password redacted" });
    } else {
      const actual = control?.value ?? "";
      const passed =
        actual === wanted || actual.toLowerCase().includes(wanted.toLowerCase());
      checks.push({
        name: "readBack",
        passed,
        detail: passed ? actual : `expected "${wanted}", got "${actual}"`,
      });
    }
  } else if (action === "navigate") {
    const passed = urlMatchesIntent(observation.url, input.url ?? "");
    checks.push({
      name: "urlIntent",
      passed,
      detail: passed ? observation.url : `expected navigation toward ${input.url}, got ${observation.url}`,
    });
  } else if (action === "click") {
    const delta =
      observation.recentChanges.length > 0 ||
      (before && (before.url !== observation.url || before.title !== observation.title)) ||
      (before && before.dialogs.join("\n") !== observation.dialogs.join("\n"));
    checks.push({
      name: "pageDelta",
      passed: Boolean(delta),
      detail: delta ? observation.recentChanges.join("; ") || observation.url : "noop click: page did not change",
    });
  } else {
    checks.push({ name: action, passed: true, detail: `${action} succeeded` });
  }
  return { status: checks.every((c) => c.passed) ? "passed" : "failed", checks };
}

function urlMatchesIntent(actual: string, target: string): boolean {
  if (!target) return false;
  try {
    const want = new URL(target);
    const got = new URL(actual);
    if (got.host !== want.host) return false;
    if (!want.pathname || want.pathname === "/") return true;
    const path = want.pathname.replace(/\/$/, "") || "/";
    return got.pathname.startsWith(path) || actual.includes(path);
  } catch {
    return actual.includes(target);
  }
}

export function recoveryNote(verification: Verification, observation: Observation): string {
  const failed = verification.checks.filter((c) => !c.passed);
  if (failed.length === 0) {
    return `Action did not meet expectations. url=${observation.url}`;
  }
  return failed.map((c) => c.detail).join(" | ");
}
