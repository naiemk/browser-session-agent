/** Closed DSL for a page-level interaction script. Not Playwright JavaScript (D2). */

export const PLAN_LIMITS = {
  maxActions: 8,
  maxAttempts: 6,
  maxStepsPerAttempt: 12,
  maxSetupSteps: 4,
  maxScrolls: 8,
  maxPredicateDepth: 4,
  maxWaitMs: 15_000,
} as const;

export type Target =
  | { by: "ref"; ref: string }
  | { by: "role"; role: string; name: string }
  | { by: "label"; label: string }
  | { by: "placeholder"; text: string }
  | { by: "text"; text: string; exact?: boolean };

export type Predicate =
  | { kind: "text_visible"; text: string }
  | { kind: "option_visible"; text: string }
  | { kind: "target_exists"; target: Target }
  | { kind: "ref_exists"; ref: string }
  | { kind: "url_includes"; text: string }
  | { kind: "title_includes"; text: string }
  | { kind: "value_includes"; target: Target; text: string }
  | { kind: "value_equals"; target: Target; text: string }
  | { kind: "any"; of: Predicate[] }
  | { kind: "all"; of: Predicate[] }
  | { kind: "not"; pred: Predicate };

export type Step =
  | { op: "click"; target: Target }
  | { op: "click_first"; targets: Target[] }
  | { op: "type"; target: Target; text: string; clear?: boolean }
  | { op: "clear"; target: Target }
  | { op: "select"; target: Target; label?: string; value?: string }
  | { op: "scroll"; target?: Target; direction?: "down" | "up"; dy?: number }
  | { op: "scroll_until"; target?: Target; until: Predicate; maxScrolls?: number; dy?: number }
  | { op: "wait"; ms?: number; until?: Predicate; timeoutMs?: number };

export interface Attempt {
  /** Short label for chat progress, e.g. "type United States". */
  name: string;
  steps: Step[];
  /** Gate: after `steps`, take this path (and run `then`) only if this holds. */
  successWhen: Predicate;
  /** Run only if `successWhen` holds (e.g. option appeared → click it). */
  then?: Step[];
  /**
   * Final accept after `then`. Defaults to “then steps succeeded”.
   * Needed because `successWhen` is often “option visible”, which goes false after the list closes.
   */
  doneWhen?: Predicate;
}

export interface PlanAction {
  id: string;
  intent: string;
  /** Shared prelude (open the combobox) before the first attempt. Re-run before later attempts only if `setupEveryAttempt`. */
  setup?: Step[];
  setupEveryAttempt?: boolean;
  try: Attempt[];
}

export interface PageContext {
  hint?: { urlIncludes?: string; titleIncludes?: string };
  /** What this page is and what the overall jobs are. */
  understanding: string;
}

export interface PagePlan {
  context: PageContext;
  goal: string;
  actions: PlanAction[];
}

export type ProgressEvent =
  | { type: "action_start"; actionId: string; intent: string }
  | { type: "attempt_start"; actionId: string; attempt: string }
  | { type: "step"; actionId: string; attempt: string; op: string; ok: boolean; detail: string }
  | { type: "attempt_result"; actionId: string; attempt: string; ok: boolean; reason: string }
  | { type: "action_done"; actionId: string; via: string }
  | { type: "action_failed"; actionId: string; actuals: string[] }
  | { type: "plan_done"; completedActionIds: string[] }
  | { type: "escalate"; reason: string };

export type PlanStatus = "completed" | "escalated" | "failed";

export interface PlanResult {
  status: PlanStatus;
  completedActionIds: string[];
  failedActionId?: string;
  /** Human-readable what actually happened — chat should show these, not model prose. */
  actuals: string[];
  progress: ProgressEvent[];
  escalateReason?: string;
}

export interface StepResult {
  ok: boolean;
  detail: string;
}

export interface PlanWorld {
  url: string;
  title: string;
  /** Visible page / listbox text for predicates. */
  pageText: string;
}

export interface PlanRuntime {
  world(): PlanWorld;
  resolve(target: Target): string | null;
  readValue(target: Target): string | undefined;
  act(step: Exclude<Step, { op: "scroll_until" | "wait" }>): Promise<StepResult> | StepResult;
  /** Re-read after a mutating step. Refs from the previous snapshot are stale. */
  inspect(): Promise<void> | void;
}
