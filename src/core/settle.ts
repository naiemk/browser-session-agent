/**
 * Not believing a "no" until the page has had a chance to say yes.
 *
 * A page answers on its own schedule. A dialog animates open, a framework re-renders on
 * the next frame, a row arrives with the response. Reading the page once and judging
 * immediately asks whether something worked before it has had the chance to, and the
 * wrong answer here is not harmless: a false failure is written to the ledger, the
 * evaluator counts repeats of it as a broken strategy, and the agent abandons a route
 * that worked. On the run that prompted this, every reported failure in the trace was
 * of exactly this kind — four of them dialogs judged mid-animation.
 *
 * The asymmetry is the whole idea. A pass is trusted on sight, because nothing that has
 * already happened un-happens; a failure is provisional until the page has been given a
 * bounded moment to disagree. So the happy path still costs one read, and only a verdict
 * that is about to cost a turn pays for a second look.
 */

import { diffControls } from "./diff.ts";
import { describeCheck } from "./predicates.ts";
import type { BrowserPort } from "./browser.ts";
import type { Observation, PageFacts, Verification } from "./types.ts";

/**
 * How long a "no" is allowed to be provisional.
 *
 * Long enough for an animation and a render, short enough that a genuinely dead click
 * is still reported promptly. The cost of waiting is latency; the cost of not waiting is
 * a wrong verdict and the turns spent acting on it, so this errs long.
 */
export const DEFAULT_SETTLE_MS = 1_500;

/**
 * Waits between re-reads, growing so a fast page is answered fast and a slow one is
 * still waited out. These sum to `DEFAULT_SETTLE_MS`, so the default budget is exactly
 * these four attempts.
 */
const BACKOFF_MS = [100, 200, 400, 800];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SettleOptions {
  tabId?: string;
  /**
   * Measure the page delta from here rather than from whatever the port last saw.
   *
   * The port computes `changes` against its own previous observation and then replaces
   * it, which is right for a caller that reads once. Read a second time and the delta
   * becomes "what changed between two polls" — not what a postcondition means, and not
   * what the trace should say. Callers that care about what an action did pass the
   * observation from before it; callers that only ask about the page as it stands
   * (predicates never read `changes`) leave this out and save a read.
   */
  since?: Observation;
  budgetMs?: number;
}

export interface Settled {
  facts: PageFacts;
  verification: Verification;
}

/**
 * Judge the page, and if the answer is no, keep looking until the budget runs out.
 *
 * Reads that throw are treated as "not yet" rather than as a failure of the thing being
 * judged: mid-navigation the execution context is torn down and a read genuinely cannot
 * be served, which is a fact about when we asked. If every attempt throws there is
 * nothing to judge and the error is the honest answer.
 */
export async function settleVerification(
  browser: BrowserPort,
  judge: (facts: PageFacts) => Verification,
  options: SettleOptions = {},
): Promise<Settled> {
  const budgetMs = options.budgetMs ?? DEFAULT_SETTLE_MS;
  let waitedMs = 0;
  let samples = 0;
  let latest: Settled | undefined;
  let lastError: unknown;

  for (let attempt = 0; ; attempt++) {
    try {
      const facts = await read(browser, options);
      const verification = judge(facts);
      samples += 1;
      latest = { facts, verification };
      if (verification.status === "passed") break;
    } catch (err) {
      lastError = err;
    }

    const pause = BACKOFF_MS[attempt];
    if (pause === undefined || waitedMs + pause > budgetMs) break;
    await delay(pause);
    waitedMs += pause;
  }

  if (!latest) throw lastError;

  // On the verdict rather than inferred from timings elsewhere: whether a failure
  // survived the wait is the first thing anyone reading the trace needs to know.
  return {
    facts: latest.facts,
    verification: { ...latest.verification, waitedMs, samples },
  };
}

async function read(browser: BrowserPort, options: SettleOptions): Promise<PageFacts> {
  const facts = await browser.facts(options.tabId);
  if (!options.since) return facts;
  return {
    ...facts,
    observation: {
      ...facts.observation,
      changes: diffControls(options.since.controls, facts.observation.controls),
    },
  };
}

/** The ledger line for a verdict, saying whether the page was given time to answer. */
export function describeVerification(verification: Verification): string {
  const checks = verification.checks.map(describeCheck).join("; ");
  const waited = verification.waitedMs ?? 0;
  if (waited === 0) return checks;
  return verification.status === "passed"
    ? `${checks} (settled after ${waited}ms)`
    : `${checks} (still failing after ${waited}ms)`;
}
