/**
 * New agent core types. Written fresh per D34; nothing here imports from the
 * rebuilt list (src/domain, src/plan, src/session.ts, src/store/run-store.ts, ...).
 */

/** A visible, addressable control. `ref` is the only way an action may address it (D5). */
export interface Control {
  ref: string;
  role: string;
  name: string;
  tag: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  required?: boolean;
  inputType?: string;
  /** True when activating this control submits an enclosing form. */
  submits?: boolean;
  /** Resolved destination for links, used by reversibility judgment. */
  href?: string;
  /**
   * The text of the list row this control sits in, when it says more than the name does.
   *
   * A row routinely spreads one thing's identity across siblings - a handle in the
   * anchor, a display name beside it - and reading only the control's own text loses
   * half of it. That is how "find Varya" failed against a row whose anchor said
   * "v_varvar": the two never appeared together anywhere the agent could see.
   */
  row?: string;
}

/** One compact, ephemeral view of a page. Never persisted into model context long-term. */
export interface Observation {
  id: string;
  tabId: string;
  url: string;
  title: string;
  controls: Control[];
  dialogs: string[];
  /** In-page validation and alert text. */
  errors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  /** Delta against the previous observation of this tab. */
  changes: string[];
  truncated?: boolean;
  capturedAt: string;
}

/** Everything a predicate may be evaluated against. */
export interface PageFacts {
  url: string;
  title: string;
  text: string;
  observation: Observation;
}

export type Predicate =
  | { kind: "url_includes"; text: string }
  | { kind: "title_includes"; text: string }
  | { kind: "text_visible"; text: string }
  | { kind: "text_absent"; text: string }
  | { kind: "ref_exists"; ref: string }
  | { kind: "control_exists"; role?: string; name?: string }
  | { kind: "control_absent"; role?: string; name?: string }
  | { kind: "value_equals"; name: string; text: string }
  | { kind: "value_includes"; name: string; text: string }
  | { kind: "no_console_error" }
  | { kind: "dialog_open"; open: boolean }
  | { kind: "all"; of: Predicate[] }
  | { kind: "any"; of: Predicate[] }
  | { kind: "not"; of: Predicate };

export interface CheckResult {
  passed: boolean;
  detail: string;
  predicate: string;
}

export interface Verification {
  status: "passed" | "failed";
  checks: CheckResult[];
}

export type ActionKind =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "scroll"
  | "wait"
  | "upload"
  | "check";

/** How recoverable an action is. Judged per action, never per verb (D23). */
export type Reversibility = "probe" | "reversible" | "navigational" | "committing";

export interface WaitSpec {
  kind: "load" | "url" | "text" | "ref" | "timeout";
  value?: string;
  timeoutMs?: number;
}

export interface ActionRequest {
  kind: ActionKind;
  tabId?: string;
  ref?: string;
  url?: string;
  text?: string;
  value?: string;
  dy?: number;
  wait?: WaitSpec;
  /** Absolute paths for an upload action. */
  files?: string[];
  /** Caller-supplied postcondition. Absent means the default for the kind applies. */
  expect?: Predicate;
  /** Why this action is being taken. Recorded on the trace. */
  intent?: string;
}

/** Evidence attached to a failed action so root cause is not a guess. */
export interface FailureBundle {
  recovery: string;
  changes: string[];
  consoleErrors: string[];
  failedRequests: string[];
  screenshot?: string;
}

export interface ActionResult {
  ok: boolean;
  kind: ActionKind;
  reversibility: Reversibility;
  reversibilityReason: string;
  observation: Observation;
  verification: Verification;
  failure?: FailureBundle;
}

export type WakeSource = "timer" | "third_party" | "human";

/** Stopping is a normal outcome, not an error (D31). */
export interface ParkedOutcome {
  status: "parked";
  reason: string;
  wake: WakeSource;
  perishable: boolean;
  /** What a human would need to act on this, when wake is "human". */
  payload?: Record<string, unknown>;
}

export type TaskOutcome =
  | { status: "success"; detail?: string }
  | { status: "failed"; reason: string }
  | { status: "capped"; turns: number }
  | ParkedOutcome;

export class CoreError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.details = details;
  }
}
