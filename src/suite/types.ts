/**
 * Browser task suite (D19). This is the scoreboard: no mechanism is worth merging
 * unless it moves these numbers.
 *
 * Criteria are authored with the task and evaluated by the runner, never by the
 * thing being measured (D20).
 */

import type { BrowserPort } from "../core/browser.ts";
import type { CheckResult, Predicate, WaitSpec } from "../core/types.ts";
import type { UsageSplit } from "../runtime/model.ts";
// Measurement infrastructure depending on measurement analysis is fine; what must not
// happen is production code importing it, which is why the view seam lives elsewhere.
import type { OptimizeSummary, Rollup } from "../optimize/rollup.ts";

/** One step of a reference solution, addressing controls by name rather than ref. */
export interface ReferenceStep {
  do:
    | "navigate"
    | "click"
    | "type"
    | "select"
    | "scroll"
    | "wait"
    | "upload"
    /** Read a URL in a side tab without leaving the page. */
    | "peek"
    /** Record that a word in the task matched more than one thing here. */
    | "fork";
  /** Substring of the control's accessible name. */
  name?: string;
  url?: string;
  text?: string;
  value?: string;
  dy?: number;
  files?: string[];
  wait?: WaitSpec;
  /** For `peek`: what must be true of the page for it to be the thing meant. */
  expect?: Predicate;
  /** For `fork`: the ambiguous term and what it could mean here. */
  term?: string;
  candidates?: string[];
  resolution?: "covered_all" | "asked" | "chose";
  /** Repeat this step until the predicate holds. Used for pagination. */
  until?: Predicate;
  maxRepeat?: number;
  /** Expected to fail; the point of the step is the failure. */
  allowFailure?: boolean;
}

/**
 * A check against the evidence a run left behind, rather than against the page.
 *
 * Page criteria cannot see procedure. An agent that silently resolves "my contacts" to one
 * of two lists reaches a perfectly good page, so nothing in the DOM distinguishes it from
 * an agent that surfaced the ambiguity first — which is exactly the failure we set out to
 * catch. The ledger can see it, so that is where these are evaluated.
 *
 * Kept separate from `criteria` so `Predicate` stays a statement about a page.
 */
export type EvidenceCheck =
  | { kind: "fork_recorded"; term?: string; minCandidates?: number }
  | { kind: "peeked"; minCount: number };

export interface SuiteTask {
  id: string;
  /** Stated the way a user would state it, not as a click list. */
  goal: string;
  /** Fixture path, resolved against the fixture origin. */
  path: string;
  /** External success criteria. Immutable, evaluated in code. */
  criteria: Predicate[];
  /** Criteria about how the run went, read from the ledger. Optional. */
  evidence?: EvidenceCheck[];
  maxSteps: number;
  tags: string[];
  /**
   * Reference solution. Proves the task is solvable and the criteria are reachable,
   * which is what stops us measuring agents against impossible tasks.
   */
  reference: ReferenceStep[];
}

export type TaskOutcomeKind = "passed" | "failed" | "capped" | "error";

export interface TaskRun {
  id: string;
  outcome: TaskOutcomeKind;
  steps: number;
  durationMs: number;
  detail: string;
  checks: CheckResult[];
  /** Results of the task's evidence checks, when it has any. */
  evidenceChecks?: CheckResult[];
  tokens?: number;
  costUsd?: number;
  /** Cache reads and fresh input are billed differently, so the total hides the story. */
  usage?: UsageSplit;
  /** What this run spent its context on, and what it bought twice. */
  metrics?: Rollup;
}

export interface SuiteReport {
  target: string;
  startedAt: string;
  finishedAt: string;
  taskCount: number;
  passed: number;
  /** Runs that could not happen (credits, rate limits, outages). Not the agent's fault. */
  errored: number;
  /** taskCount minus errored: the denominator for success rate. */
  scored: number;
  successRate: number;
  stepsPerTask: number;
  costPerTask?: number;
  tokensPerTask?: number;
  /** False when too much of the run was lost to infrastructure to draw a conclusion. */
  valid: boolean;
  /**
   * Per-task cost and waste, in the shape `browser-agent compare` reads.
   *
   * Present whenever the driver metered itself, which the reference target never does
   * because it runs no model and has no context to spend.
   */
  optimize?: OptimizeSummary;
  runs: TaskRun[];
}

export interface DriverContext {
  task: SuiteTask;
  browser: BrowserPort;
  tabId: string;
  origin: string;
  maxSteps: number;
  /** Called once per browser action. Throws once the cap is exceeded. */
  step(): void;
  /**
   * Where this run must write its evidence.
   *
   * The runner chooses it and reads it back itself, so a driver cannot decide what gets
   * evaluated — the same reason criteria are snapshotted before the driver is handed
   * anything.
   */
  evidence?: { root: string; goalId: string };
}

export interface DriverOutcome {
  /** What the driver claims it did. Never trusted; recorded for comparison. */
  claimed?: string;
  tokens?: number;
  costUsd?: number;
  /**
   * Set when the run could not happen for reasons outside the agent: exhausted
   * credits, rate limits, provider outages. These runs are excluded from the success
   * rate, because scoring them would blame the agent for the bill.
   */
  infraError?: string;
  usage?: UsageSplit;
  /** What the run spent, when the driver metered itself. */
  metrics?: Rollup;
}

export interface AgentDriver {
  readonly name: string;
  runTask(context: DriverContext): Promise<DriverOutcome>;
}

export class StepCapExceeded extends Error {
  constructor(readonly steps: number) {
    super(`step cap exceeded after ${steps} steps`);
    this.name = "StepCapExceeded";
  }
}
