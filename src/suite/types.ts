/**
 * Browser task suite (D19). This is the scoreboard: no mechanism is worth merging
 * unless it moves these numbers.
 *
 * Criteria are authored with the task and evaluated by the runner, never by the
 * thing being measured (D20).
 */

import type { BrowserPort } from "../core/browser.ts";
import type { CheckResult, Predicate, WaitSpec } from "../core/types.ts";

/** One step of a reference solution, addressing controls by name rather than ref. */
export interface ReferenceStep {
  do: "navigate" | "click" | "type" | "select" | "scroll" | "wait" | "upload";
  /** Substring of the control's accessible name. */
  name?: string;
  url?: string;
  text?: string;
  value?: string;
  dy?: number;
  files?: string[];
  wait?: WaitSpec;
  /** Repeat this step until the predicate holds. Used for pagination. */
  until?: Predicate;
  maxRepeat?: number;
  /** Expected to fail; the point of the step is the failure. */
  allowFailure?: boolean;
}

export interface SuiteTask {
  id: string;
  /** Stated the way a user would state it, not as a click list. */
  goal: string;
  /** Fixture path, resolved against the fixture origin. */
  path: string;
  /** External success criteria. Immutable, evaluated in code. */
  criteria: Predicate[];
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
  tokens?: number;
  costUsd?: number;
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
