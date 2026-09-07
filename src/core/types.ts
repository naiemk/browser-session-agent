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
  /**
   * Site furniture: this control lives in a header, nav or footer landmark.
   *
   * Recorded so a crowded page can be trimmed to the part the agent came for. It is
   * never a reason to drop a control - a nav link is often the route wanted - only a
   * reason to give up its slot last.
   */
  chrome?: boolean;
  /**
   * This control lives inside an open dialog.
   *
   * When a dialog is open it owns the control budget: the slots go to what is in the
   * overlay, not to the page sitting under it. Hit-testing cannot always see a centred
   * card, so containment in the dialog node is the signal, not occlusion alone.
   */
  dialog?: boolean;
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
  /**
   * How many controls the page had before any cap, so the model is told the real
   * remainder. Reporting the shortfall against an already-capped list said "40 more" on
   * a follower dialog with hundreds of rows.
   */
  totalControls?: number;
  /**
   * How this observation was made. The model never sees it; reports and the CLI do.
   *
   * Optional because the reference perceiver has nothing to say beyond its name, and a
   * snapshot loaded from an older ledger has no record of the strategy that produced it.
   */
  perception?: PerceptionTrace;
  /**
   * Visible heading and a few labeled numbers, when the page has them.
   *
   * Caps stay small: this is so the model does not have to probe for a follower count
   * that is already on screen, not a second extract-the-page tool.
   */
  identity?: { heading?: string; stats?: Array<{ label: string; value: string }> };
  capturedAt: string;
}

/** Which perceiver ran, and what each stage dropped, so a report can attribute a change. */
export interface PerceptionTrace {
  perceiver: string;
  dropped: {
    occlusion?: number;
    containment?: number;
  };
}

/** Everything a predicate may be evaluated against. */
export interface PageFacts {
  url: string;
  title: string;
  text: string;
  observation: Observation;
  /**
   * Whether this tab is an HTML page or a data payload (JSON, XML, bytes).
   *
   * Optional so an older snapshot or a stub port without the inspector still works.
   * Absent is treated as a page: we only refuse when we have evidence it is not.
   */
  document?: { kind: "html" | "data"; contentType: string; bytes: number };
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
  /**
   * How long the page was given to settle before this verdict was final.
   *
   * Absent when the first look answered it. Present and non-zero means the first look
   * said no and we kept asking, which is the difference between "this failed" and "this
   * had not happened yet".
   */
  waitedMs?: number;
  /** How many times the page was read to reach the verdict. */
  samples?: number;
}

export type ActionKind =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "scroll"
  | "wait"
  | "upload"
  | "check"
  | "restore";

/**
 * How recoverable an action is for the loop (checkpoint / try / restore).
 * Judged per action, never per verb (D23). Unknown is not a human ask.
 */
export type Reversibility = "probe" | "reversible" | "navigational" | "unknown";

/**
 * Whether a human must authorize this action. Positive match only: unmatched is none.
 */
export type Authorization = "none" | "outbound" | "destructive";

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
  authorization?: Authorization;
  authorizationReason?: string;
  observation: Observation;
  verification: Verification;
  failure?: FailureBundle;
  /** Set when an unknown exploration click failed its expect and the prior page was restored. */
  restored?: true;
}

export type WakeSource = "timer" | "third_party" | "human";

/** Stopping is a normal outcome, not an error (D31). */
export interface ParkedOutcome {
  status: "parked";
  reason: string;
  wake: WakeSource;
  perishable: boolean;
  /** Agent-suggested delay before retry; the scheduler clamps it. */
  recommendedRetryMs?: number;
  /** Semantic handoff for the next attempt. Not a DOM dump. */
  handoff?: string;
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
