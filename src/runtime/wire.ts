/**
 * What the model actually sees.
 *
 * Observations are the dominant token cost of a browser agent: a snapshot goes to the
 * model on every look, and a verbose one multiplies across every turn of every task.
 * The core keeps the full truth; this trims it to the fields a decision needs, drops
 * empty values rather than sending nulls, and caps the control list.
 */

import { chooseControls } from "../core/diff.ts";
import type { ActionResult, Observation, Verification } from "../core/types.ts";

export const MAX_WIRE_CONTROLS = 40;
export const MAX_WIRE_TEXT = 120;

export interface WireControl {
  ref: string;
  role: string;
  name: string;
  value?: string;
  /** The rest of the row, when the name alone does not identify the thing. */
  row?: string;
  /** Only present when true, so the common case costs nothing. */
  required?: true;
  disabled?: true;
  checked?: true;
  submits?: true;
}

export interface WireObservation {
  url: string;
  title: string;
  controls: WireControl[];
  dialogs?: string[];
  errors?: string[];
  consoleErrors?: string[];
  failedRequests?: string[];
  changes?: string[];
  note?: string;
}

function clip(value: string, max = MAX_WIRE_TEXT): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function omitEmpty<T>(values: T[] | undefined): T[] | undefined {
  return values && values.length > 0 ? values : undefined;
}

export function toWireObservation(observation: Observation): WireObservation {
  const controls = chooseControls(observation.controls, MAX_WIRE_CONTROLS).map((control) => {
    const wire: WireControl = {
      ref: control.ref,
      role: control.role,
      name: clip(control.name),
    };
    if (control.value) wire.value = clip(control.value);
    // The rest of the row, when the name alone does not identify the thing. Costs tokens
    // and earns them: without it a display name and a handle never appear together.
    if (control.row) wire.row = clip(control.row);
    if (control.required) wire.required = true;
    if (control.disabled) wire.disabled = true;
    if (control.checked) wire.checked = true;
    if (control.submits) wire.submits = true;
    return wire;
  });

  // Assigned conditionally rather than as undefined, so `"errors" in observation` means
  // what it looks like it means.
  const wire: WireObservation = { url: observation.url, title: clip(observation.title), controls };
  const dialogs = omitEmpty(observation.dialogs.map((entry) => clip(entry)));
  const errors = omitEmpty(observation.errors.map((entry) => clip(entry)));
  const consoleErrors = omitEmpty(observation.consoleErrors.slice(-3).map((entry) => clip(entry)));
  const failedRequests = omitEmpty(
    observation.failedRequests.slice(-3).map((entry) => clip(entry)),
  );
  const changes = omitEmpty(observation.changes.slice(0, 6).map((entry) => clip(entry)));
  // Against the page, not against an already-capped copy of it: the core trims to its own
  // limit before this runs, so counting from `observation.controls` reported "40 more" on
  // a list of hundreds and the model believed one more look would cover it.
  const total = observation.totalControls ?? observation.controls.length;
  const dropped = total - controls.length;

  if (dialogs) wire.dialogs = dialogs;
  if (errors) wire.errors = errors;
  if (consoleErrors) wire.consoleErrors = consoleErrors;
  if (failedRequests) wire.failedRequests = failedRequests;
  if (changes) wire.changes = changes;
  if (dropped > 0) {
    wire.note = `${controls.length} of ${total} controls shown; probe with a selector to narrow down`;
  }
  return wire;
}

export interface WireActionResult {
  ok: boolean;
  reversibility: string;
  /** Only the failing checks: a passing action needs no explanation. */
  why?: string[];
  recovery?: string;
  consoleErrors?: string[];
  failedRequests?: string[];
  observation: WireObservation;
}

export function toWireActionResult(result: ActionResult): WireActionResult {
  const failed = result.verification.checks.filter((check) => !check.passed);
  const wire: WireActionResult = {
    ok: result.ok,
    reversibility: result.reversibility,
    observation: toWireObservation(result.observation),
  };

  const why = omitEmpty(failed.map((check) => `${check.predicate}: ${check.detail}`));
  const consoleErrors = omitEmpty(result.failure?.consoleErrors?.slice(-3));
  const failedRequests = omitEmpty(result.failure?.failedRequests?.slice(-3));

  if (why) wire.why = why;
  if (result.failure?.recovery) wire.recovery = result.failure.recovery;
  if (consoleErrors) wire.consoleErrors = consoleErrors;
  if (failedRequests) wire.failedRequests = failedRequests;
  return wire;
}

export function toWireVerification(verification: Verification): {
  passed: boolean;
  checks: string[];
} {
  return {
    passed: verification.status === "passed",
    checks: verification.checks.map(
      (check) => `${check.passed ? "pass" : "FAIL"} ${check.predicate}: ${check.detail}`,
    ),
  };
}

/** Compact JSON: no indentation, because indentation is billed. */
export function wireText(value: unknown): string {
  return JSON.stringify(value);
}

/** Tool result content, which providers model as text parts rather than a bare string. */
export function extractText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter((part): part is { type: string; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text"),
    )
    .map((part) => part.text);
  return parts.length > 0 ? parts.join("") : undefined;
}

function looksLikeSnapshot(value: unknown, controls: (value: unknown) => boolean): boolean {
  const candidate = value as { url?: unknown; controls?: unknown } | undefined;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      typeof candidate.url === "string" &&
      controls(candidate.controls),
  );
}

/**
 * Find a page snapshot anywhere in a tool result.
 *
 * Snapshots are the dominant token cost, and four tools return one under four different
 * keys: `observe` at the top level, `act` under `observation`, `peek` under `page`, and
 * the stranger view under `asStranger`. Matching on shape rather than on a list of key
 * or tool names means a tool added later is covered without anyone remembering to
 * register it, which is exactly the mistake the name-based version made.
 */
export function findSnapshot(
  value: unknown,
  controls: (value: unknown) => boolean,
): Record<string, unknown> | undefined {
  if (looksLikeSnapshot(value, controls)) return value as Record<string, unknown>;
  if (!value || typeof value !== "object") return undefined;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (looksLikeSnapshot(nested, controls)) return nested as Record<string, unknown>;
  }
  return undefined;
}

/** The snapshot as objects, which is what the baseline view sends. */
export function findWireObservation(value: unknown): WireObservation | undefined {
  return findSnapshot(value, Array.isArray) as WireObservation | undefined;
}

/**
 * The payload back from serialized tool result content.
 *
 * Every tool sends the model exactly what it puts in `details`, so parsing the text
 * recovers the structure when only the wire form survived - which is the case for events
 * that have crossed a websocket.
 */
export function payloadInContent(content: unknown): unknown {
  const text = extractText(content);
  if (!text || !text.startsWith("{")) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The same, from serialized tool result content. Returns undefined when it is not JSON. */
export function observationInContent(content: unknown): WireObservation | undefined {
  const payload = payloadInContent(content);
  return payload === undefined ? undefined : findWireObservation(payload);
}
