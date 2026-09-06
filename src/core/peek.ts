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
 *
 * A JSON (or XML, or bytes) response is a successful fetch and a failed place to peek:
 * the URL matches, `matched` used to say yes, and then the model treated an empty
 * snapshot as a page. Classify first; only then wait for paint.
 */

import type { BrowserPort } from "./browser.ts";
import { describeDataDocument, type DocumentInfo } from "./document.ts";
import type { LedgerSink } from "./ledger.ts";
import { evaluatePredicate } from "./predicates.ts";
import { settleVerification } from "./settle.ts";
import { CoreError, type CheckResult, type Observation, type PageFacts, type Predicate } from "./types.ts";
import { urlMatchesIntent } from "./url-intent.ts";

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
  ledger?: LedgerSink;
  entityId?: string;
  intent?: string;
}

export interface PeekResult {
  observation: Observation;
  /** Absent when the caller asked for no verification. */
  identity?: CheckResult;
  /** False when the side tab's URL is not the URL we asked to open, or is not a page. */
  matched: boolean;
  /** Set when the tab landed on a payload rather than HTML. */
  dataDocument?: DocumentInfo;
  /** The tab we came from, proven not to have moved. */
  origin: { url: string; unchanged: boolean };
}

/**
 * Read a tab that was just opened.
 *
 * A data document is returned immediately: waiting will not turn JSON into a page.
 * HTML waits until two reads agree on URL and control count (or the settle budget).
 */
export async function readOpenedTab(browser: BrowserPort, tabId: string): Promise<PageFacts> {
  const first = await browser.facts(tabId);
  if (first.document?.kind === "data") return first;
  const { facts } = await settleVerification(
    browser,
    () => ({ status: "passed", checks: [{ passed: true, predicate: "htmlDocument", detail: "page" }] }),
    { tabId, until: "stable" },
  );
  return facts;
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
  let facts: PageFacts;
  try {
    facts = await readOpenedTab(browser, sideTab);
  } finally {
    await browser.closeTab(sideTab);
  }

  const dataDocument = facts.document?.kind === "data" ? facts.document : undefined;
  const observation = facts.observation;
  const matched = !dataDocument && urlMatchesIntent(observation.url, options.url);
  const identity =
    !dataDocument && options.expect ? evaluatePredicate(options.expect, facts) : undefined;

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
      withSession: true,
      ...(dataDocument ? { document: describeDataDocument(dataDocument) } : {}),
    },
  });

  return {
    observation,
    ...(identity ? { identity } : {}),
    matched,
    ...(dataDocument ? { dataDocument } : {}),
    origin: { url: before.url, unchanged },
  };
}
