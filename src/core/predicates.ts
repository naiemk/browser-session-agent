/**
 * Code-only predicate evaluation. No model call is ever made on this path, so a
 * criterion is ground truth the executor cannot talk its way past (D20).
 *
 * Written fresh for the new core (D34). The old src/plan/evaluate.ts informed the
 * shape only.
 */

import type { CheckResult, PageFacts, Predicate, Verification } from "./types.ts";

const PREDICATE_KINDS = new Set([
  "url_includes",
  "title_includes",
  "text_visible",
  "text_absent",
  "ref_exists",
  "control_exists",
  "control_absent",
  "value_equals",
  "value_includes",
  "no_console_error",
  "dialog_open",
  "all",
  "any",
  "not",
]);

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * What the page says, including what has been typed into it.
 *
 * `facts.text` is the body's innerText, and the value of an input is not part of it:
 * type a name into a box and the page's text does not change, so asking whether the
 * text you just typed is visible answers no however well the typing worked. That is a
 * false failure with a real cost — it was one of the failures in the trace that
 * prompted this — and it is also simply wrong, because a person looking at the screen
 * can see it. Values come from the same snapshot the model is shown, where passwords
 * are already redacted, so nothing secret is searchable here that was not already out.
 */
function readableText(facts: PageFacts): string {
  const values = facts.observation.controls
    .map((control) => control.value)
    .filter((value): value is string => Boolean(value));
  return values.length === 0 ? facts.text : `${facts.text}\n${values.join("\n")}`;
}

function matchesControl(
  facts: PageFacts,
  role: string | undefined,
  name: string | undefined,
): boolean {
  return facts.observation.controls.some((control) => {
    if (role && control.role !== role) return false;
    if (name && !includesInsensitive(control.name, name)) return false;
    return true;
  });
}

function findByName(facts: PageFacts, name: string) {
  return facts.observation.controls.find((control) => includesInsensitive(control.name, name));
}

export function describePredicate(pred: Predicate): string {
  switch (pred.kind) {
    case "url_includes":
      return `url includes "${pred.text}"`;
    case "title_includes":
      return `title includes "${pred.text}"`;
    case "text_visible":
      return `text visible "${pred.text}"`;
    case "text_absent":
      return `text absent "${pred.text}"`;
    case "ref_exists":
      return `ref ${pred.ref} exists`;
    case "control_exists":
      return `control exists ${pred.role ?? "any"} "${pred.name ?? ""}"`;
    case "control_absent":
      return `control absent ${pred.role ?? "any"} "${pred.name ?? ""}"`;
    case "value_equals":
      return `"${pred.name}" equals "${pred.text}"`;
    case "value_includes":
      return `"${pred.name}" includes "${pred.text}"`;
    case "no_console_error":
      return "no console error";
    case "dialog_open":
      return pred.open ? "a dialog is open" : "no dialog is open";
    case "all":
      return `all of (${pred.of.map(describePredicate).join(", ")})`;
    case "any":
      return `any of (${pred.of.map(describePredicate).join(", ")})`;
    case "not":
      return `not (${describePredicate(pred.of)})`;
  }
}

/** Evaluate one predicate. Returns the outcome plus human-readable actuals. */
export function evaluatePredicate(pred: Predicate, facts: PageFacts): CheckResult {
  const description = describePredicate(pred);
  const result = (passed: boolean, detail: string): CheckResult => ({
    passed,
    detail,
    predicate: description,
  });

  switch (pred.kind) {
    case "url_includes":
      return result(facts.url.includes(pred.text), `url=${facts.url}`);
    case "title_includes":
      return result(includesInsensitive(facts.title, pred.text), `title=${facts.title}`);
    case "text_visible":
      return result(
        includesInsensitive(readableText(facts), pred.text),
        `text not found: "${pred.text}"`,
      );
    case "text_absent":
      return result(
        !includesInsensitive(readableText(facts), pred.text),
        `text present: "${pred.text}"`,
      );
    case "ref_exists":
      return result(
        facts.observation.controls.some((c) => c.ref === pred.ref),
        `refs=${facts.observation.controls.map((c) => c.ref).join(",")}`,
      );
    case "control_exists":
      return result(matchesControl(facts, pred.role, pred.name), summarizeControls(facts));
    case "control_absent":
      return result(!matchesControl(facts, pred.role, pred.name), summarizeControls(facts));
    case "value_equals": {
      const control = findByName(facts, pred.name);
      const actual = control?.value ?? "";
      return result(actual === pred.text, `actual="${actual}"`);
    }
    case "value_includes": {
      const control = findByName(facts, pred.name);
      const actual = control?.value ?? "";
      return result(includesInsensitive(actual, pred.text), `actual="${actual}"`);
    }
    case "no_console_error":
      return result(
        facts.observation.consoleErrors.length === 0,
        facts.observation.consoleErrors.join("; ") || "none",
      );
    case "dialog_open": {
      const open = facts.observation.dialogs.length > 0;
      return result(open === pred.open, open ? facts.observation.dialogs.join("; ") : "none open");
    }
    case "all": {
      const parts = pred.of.map((p) => evaluatePredicate(p, facts));
      const failed = parts.filter((p) => !p.passed);
      return result(failed.length === 0, failed.map((f) => f.detail).join(" | ") || "all passed");
    }
    case "any": {
      const parts = pred.of.map((p) => evaluatePredicate(p, facts));
      const passed = parts.some((p) => p.passed);
      return result(passed, passed ? "one matched" : parts.map((p) => p.detail).join(" | "));
    }
    case "not": {
      const inner = evaluatePredicate(pred.of, facts);
      return result(!inner.passed, inner.detail);
    }
  }
}

function summarizeControls(facts: PageFacts): string {
  return facts.observation.controls
    .slice(0, 12)
    .map((c) => `${c.role}:${c.name}`)
    .join(", ");
}

/** Evaluate a list of predicates as one verification. */
export function verify(predicates: Predicate[], facts: PageFacts): Verification {
  const checks = predicates.map((pred) => evaluatePredicate(pred, facts));
  return {
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    checks,
  };
}

/**
 * Reject unknown kinds and script-shaped input before evaluation. Follows the
 * closed-verb pattern the old page-plan validator used: anything not in the set
 * is refused rather than best-guessed.
 */
export function validatePredicate(value: unknown, path = "predicate"): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [`${path}: expected an object`];
  }
  const pred = value as { kind?: unknown; of?: unknown; [key: string]: unknown };
  if (typeof pred.kind !== "string") {
    return [`${path}: missing "kind"`];
  }
  if (!PREDICATE_KINDS.has(pred.kind)) {
    return [`${path}: unknown predicate kind "${pred.kind}"`];
  }

  const errors: string[] = [];
  const needsText = ["url_includes", "title_includes", "text_visible", "text_absent"];
  if (needsText.includes(pred.kind) && typeof pred.text !== "string") {
    errors.push(`${path}: "${pred.kind}" needs a string "text"`);
  }
  if (pred.kind === "ref_exists" && typeof pred.ref !== "string") {
    errors.push(`${path}: "ref_exists" needs a string "ref"`);
  }
  if (
    (pred.kind === "value_equals" || pred.kind === "value_includes") &&
    (typeof pred.name !== "string" || typeof pred.text !== "string")
  ) {
    errors.push(`${path}: "${pred.kind}" needs string "name" and "text"`);
  }
  if (pred.kind === "dialog_open" && typeof pred.open !== "boolean") {
    errors.push(`${path}: "dialog_open" needs a boolean "open"`);
  }
  if (pred.kind === "all" || pred.kind === "any") {
    if (!Array.isArray(pred.of) || pred.of.length === 0) {
      errors.push(`${path}: "${pred.kind}" needs a non-empty "of" array`);
    } else {
      pred.of.forEach((child, index) => {
        errors.push(...validatePredicate(child, `${path}.of[${index}]`));
      });
    }
  }
  if (pred.kind === "not") {
    errors.push(...validatePredicate(pred.of, `${path}.of`));
  }
  for (const key of ["script", "code", "evaluate", "fn", "expression"]) {
    if (key in pred) {
      errors.push(`${path}: "${key}" is not allowed; predicates are data, not code`);
    }
  }
  return errors;
}

export function parsePredicate(value: unknown): Predicate {
  const errors = validatePredicate(value);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return value as Predicate;
}
