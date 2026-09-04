/**
 * Reading something without going there.
 *
 * A coding agent can read fifty files and still be exactly where it was. In a browser a
 * read *moves you*, and you may not get back: navigate away from a paginated list and you
 * lose the page you were on, the scroll offset, and whatever the list had lazily loaded.
 * So inspecting forty items one at a time costs open, read, back, and re-paginate for each
 * one, which is how an agent burns its whole budget on the first three.
 *
 * That is not bad judgement, it is a missing action. This is the missing action: open the
 * thing in a second tab that shares our session, read it, close it. The tab we were on
 * never moves, so there is nothing to restore.
 *
 * The important subtlety is that the identifier used to get there may be wrong. A
 * constructed URL fails in two very different ways: a 404 is cheap and obvious, but a URL
 * that resolves to the *wrong* entity is silent and poisons everything read from it. So a
 * peek can carry an expectation, and reports whether it held.
 */

import type { BrowserPort } from "./browser.ts";
import type { Ledger } from "./ledger.ts";
import { evaluatePredicate } from "./predicates.ts";
import { CoreError, type CheckResult, type Observation, type Predicate } from "./types.ts";

export interface PeekOptions {
  /** Where to look. Absolute, or same-origin absolute path. */
  url: string;
  /** The tab that must not move. Defaults to the current one. */
  tabId?: string;
  /**
   * What must be true of the page for it to be the thing we meant.
   *
   * Optional, but a peek reached by guessing a URL and not checked is evidence of
   * nothing in particular.
   */
  expect?: Predicate;
  ledger?: Ledger;
  entityId?: string;
  intent?: string;
}

export interface PeekResult {
  observation: Observation;
  /** Absent when the caller asked for no verification. */
  identity?: CheckResult;
  /** False when the peek landed somewhere that is not what we asked for. */
  matched: boolean;
  /** The tab we came from, proven not to have moved. */
  origin: { url: string; unchanged: boolean };
}

/**
 * Open a URL in a side tab that shares our session, read it, and close it.
 *
 * Always closes, including on failure: a peek that leaked its tab would quietly become a
 * second place the agent could be, which is the confusion this exists to remove.
 */
export async function peek(browser: BrowserPort, options: PeekOptions): Promise<PeekResult> {
  if (!options.url || !options.url.trim()) {
    throw new CoreError("peek_rejected", "peek needs a url");
  }

  const before = await browser.observe(options.tabId);

  const sideTab = await browser.openTab(options.url);
  let observation: Observation;
  let identity: CheckResult | undefined;
  try {
    const facts = await browser.facts(sideTab);
    observation = facts.observation;
    identity = options.expect ? evaluatePredicate(options.expect, facts) : undefined;
  } finally {
    await browser.closeTab(sideTab);
  }

  const matched = identity ? identity.passed : true;

  // The origin was never navigated, so there is nothing to restore. Confirming that
  // rather than asserting it is what makes the route trustworthy enough to prefer.
  const after = await browser.observe(options.tabId);
  const unchanged = after.url === before.url;

  await options.ledger?.append({
    type: "probe",
    entityId: options.entityId,
    intent: options.intent ?? `peek ${options.url}`,
    before: {
      url: before.url,
      title: before.title,
      controls: before.controls.length,
      ...(before.truncated ? { truncated: true as const } : {}),
    },
    after: { url: observation.url, title: observation.title, changes: [] },
    payload: {
      peek: options.url,
      matched,
      identity: identity?.detail,
      originUnchanged: unchanged,
      // Recorded for the observability gate: this read carried our session, so whoever
      // owns the page may be able to see that we made it.
      withSession: true,
    },
  });

  return {
    observation,
    ...(identity ? { identity } : {}),
    matched,
    origin: { url: before.url, unchanged },
  };
}
