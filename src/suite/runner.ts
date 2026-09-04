/**
 * The runner owns measurement. It opens a tab, hands the task to a driver, and then
 * evaluates the task's criteria itself against a fresh look at the page.
 *
 * Two properties matter and are enforced here rather than trusted:
 *   - the driver cannot influence what is evaluated (criteria are snapshotted first)
 *   - a step cap produces "capped", which is a different outcome from "failed"
 */

import { LocalBrowser, type BrowserPort } from "../core/browser.ts";
import { Ledger } from "../core/ledger.ts";
import { verify } from "../core/predicates.ts";
import type { Predicate } from "../core/types.ts";
import { evaluateAllEvidence } from "./evidence.ts";
import {
  StepCapExceeded,
  type AgentDriver,
  type EvidenceCheck,
  type SuiteReport,
  type SuiteTask,
  type TaskRun,
} from "./types.ts";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

/** A copy the driver has no reference to, so criteria cannot be edited mid-run. */
function snapshotCriteria(task: SuiteTask): Predicate[] {
  return structuredClone(task.criteria) as Predicate[];
}

function snapshotEvidence(task: SuiteTask): EvidenceCheck[] {
  return structuredClone(task.evidence ?? []) as EvidenceCheck[];
}

export interface RunSuiteOptions {
  tasks: SuiteTask[];
  driver: AgentDriver;
  origin: string;
  browser?: BrowserPort;
  headless?: boolean;
  only?: string[];
  onTask?: (run: TaskRun) => void;
  /**
   * Where runs write their evidence. Required for tasks that carry evidence checks; the
   * runner names the goal so a driver cannot point it elsewhere.
   */
  evidenceRoot?: string;
  /**
   * Gap between tasks. Running many model-backed sessions back to back trips provider
   * rate limits, and a throttled request looks exactly like an agent that did nothing.
   * The suite must measure the agent, not the rate limiter.
   */
  pauseMs?: number;
}

export async function runSuite(options: RunSuiteOptions): Promise<SuiteReport> {
  const startedAt = new Date().toISOString();
  const selected = options.only?.length
    ? options.tasks.filter((task) => options.only!.includes(task.id))
    : options.tasks;

  const ownBrowser = !options.browser;
  const browser = options.browser ?? (await LocalBrowser.launch({ headless: options.headless ?? true }));
  const runs: TaskRun[] = [];

  try {
    for (const [index, task] of selected.entries()) {
      if (index > 0 && options.pauseMs) {
        await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
      }
      runs.push(await runOne(task, browser, options));
      options.onTask?.(runs[runs.length - 1]!);
    }
  } finally {
    if (ownBrowser) await browser.close();
  }

  const passed = runs.filter((run) => run.outcome === "passed").length;
  const errored = runs.filter((run) => run.outcome === "error").length;
  const scored = runs.length - errored;
  const totals = runs.reduce(
    (acc, run) => ({
      steps: acc.steps + run.steps,
      tokens: acc.tokens + (run.tokens ?? 0),
      cost: acc.cost + (run.costUsd ?? 0),
    }),
    { steps: 0, tokens: 0, cost: 0 },
  );
  const denominator = scored || 1;

  return {
    target: options.driver.name,
    startedAt,
    finishedAt: new Date().toISOString(),
    taskCount: runs.length,
    passed,
    errored,
    scored,
    successRate: round(passed / denominator),
    stepsPerTask: round(totals.steps / denominator),
    tokensPerTask: totals.tokens > 0 ? round(totals.tokens / denominator) : undefined,
    costPerTask: totals.cost > 0 ? round(totals.cost / denominator, 6) : undefined,
    // A run that lost more than a quarter of its tasks to infrastructure says nothing
    // about the agent, so it must not be quoted as a result.
    valid: runs.length > 0 && errored / runs.length <= 0.25,
    runs,
  };
}

async function runOne(
  task: SuiteTask,
  browser: BrowserPort,
  options: RunSuiteOptions,
): Promise<TaskRun> {
  const criteria = snapshotCriteria(task);
  const evidenceChecks = snapshotEvidence(task);
  const startedAt = Date.now();
  let steps = 0;

  const goalId = `suite-${task.id}`;
  const context = {
    task: deepFreeze({ ...task }),
    browser,
    tabId: "",
    origin: options.origin,
    maxSteps: task.maxSteps,
    step: () => {
      steps += 1;
      if (steps > task.maxSteps) throw new StepCapExceeded(steps);
    },
    ...(options.evidenceRoot ? { evidence: { root: options.evidenceRoot, goalId } } : {}),
  };

  let outcome: TaskRun["outcome"] = "failed";
  let detail = "";
  let tokens: number | undefined;
  let costUsd: number | undefined;
  let capped = false;
  let infraError: string | undefined;

  try {
    context.tabId = await browser.openTab(`${options.origin}${task.path}`);
    const result = await options.driver.runTask(context);
    tokens = result.tokens;
    costUsd = result.costUsd;
    detail = result.claimed ?? "";
    infraError = result.infraError;
  } catch (err) {
    if (err instanceof StepCapExceeded) {
      capped = true;
      detail = err.message;
    } else {
      // A driver error is still measured: the criteria decide the outcome below.
      detail = err instanceof Error ? err.message : String(err);
    }
  }

  // A run that never happened is not a run the agent failed.
  if (infraError) {
    return {
      id: task.id,
      outcome: "error",
      steps,
      durationMs: Date.now() - startedAt,
      detail: `infrastructure: ${infraError}`,
      checks: [],
      tokens,
      costUsd,
    };
  }

  // The verdict never comes from the driver.
  let checks: TaskRun["checks"] = [];
  let evidence: TaskRun["checks"] | undefined;
  try {
    const facts = await browser.facts(context.tabId || undefined);
    const verification = verify(criteria, facts);
    checks = verification.checks;

    // How the run went, when the task cares. A page can look right for the wrong reasons.
    if (evidenceChecks.length > 0) {
      if (!options.evidenceRoot) {
        throw new Error(
          `task ${task.id} has evidence checks but the suite was run without an evidenceRoot`,
        );
      }
      evidence = evaluateAllEvidence(evidenceChecks, await Ledger.readFrom(options.evidenceRoot, goalId));
    }

    const evidencePassed = (evidence ?? []).every((check) => check.passed);
    if (verification.status === "passed" && evidencePassed) {
      outcome = capped ? "capped" : "passed";
      if (capped) detail = `${detail} (criteria met but step cap exceeded)`;
    } else {
      outcome = capped ? "capped" : "failed";
      const failed = [...checks, ...(evidence ?? [])].filter((check) => !check.passed);
      detail = [detail, failed.map((check) => `${check.predicate}: ${check.detail}`).join("; ")]
        .filter(Boolean)
        .join(" — ");
    }
  } catch (err) {
    outcome = "error";
    detail = `criteria evaluation failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    id: task.id,
    outcome,
    steps,
    durationMs: Date.now() - startedAt,
    detail,
    checks,
    ...(evidence ? { evidenceChecks: evidence } : {}),
    tokens,
    costUsd,
  };
}

export function formatReport(report: SuiteReport): string {
  const pct = (report.successRate * 100).toFixed(1);
  const cost = report.costPerTask === undefined ? "n/a" : `$${report.costPerTask.toFixed(4)}`;
  const head = `${report.target}: ${report.passed}/${report.scored} passed (${pct}%), ${report.stepsPerTask} steps/task, ${cost}/task`;
  if (report.errored > 0) {
    const note = report.valid
      ? `${report.errored} run(s) lost to infrastructure and excluded`
      : `INVALID: ${report.errored}/${report.taskCount} runs lost to infrastructure; do not quote this as a result`;
    return `${head}\n${note}`;
  }
  return head;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
