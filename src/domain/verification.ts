import type { Expectation, Observation, Verification, VerificationCheck } from "./types.ts";

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

export function recoveryNote(verification: Verification, observation: Observation): string {
  const failed = verification.checks.filter((c) => !c.passed);
  if (failed.length === 0) {
    return `Action did not meet expectations. url=${observation.url}`;
  }
  return failed.map((c) => c.detail).join(" | ");
}
