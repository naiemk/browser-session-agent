/**
 * Looking at a page from another perspective.
 *
 * The agent constantly needs to know where it stands: who it is acting as, what its session
 * grants, whether what it is looking at is reachable by anyone. Encoding answers to those
 * questions is hopeless — they differ per site, per session, and per task, and any taxonomy
 * we write ("your own data", "public data", "delegated") is wrong for the next case.
 *
 * One mechanism answers all of them without knowing anything about any site: load the same
 * URL with no session and compare. A redirect to a login wall, a shorter control list, or an
 * identical page are all facts the model can reason from.
 *
 * This deliberately returns observations and differences, never a verdict. There is no
 * `isPublic` here, because "public" is a conclusion and conclusions belong to the caller.
 * A difference is also only evidence: A/B tests, geography, and consent walls all change an
 * anonymous view for reasons that have nothing to do with authorization.
 */

import type { BrowserPort } from "./browser.ts";
import type { Ledger } from "./ledger.ts";
import type { Observation } from "./types.ts";

export interface PerspectiveDelta {
  /** The URL the signed-in tab is on. */
  signedInUrl: string;
  /** Where the same URL landed with no session. A change usually means a redirect. */
  signedOutUrl: string;
  urlChanged: boolean;
  signedInTitle: string;
  signedOutTitle: string;
  /** Control names present with the session and absent without it. */
  onlyWithSession: string[];
  /** Control names present without the session and absent with it. */
  onlyWithoutSession: string[];
  signedInControlCount: number;
  signedOutControlCount: number;
}

export interface PerspectiveResult {
  signedOut: Observation;
  delta: PerspectiveDelta;
}

const MAX_LISTED = 12;

function names(observation: Observation): Set<string> {
  return new Set(observation.controls.map((control) => `${control.role}:${control.name}`));
}

export function compareObservations(
  signedIn: Observation,
  signedOut: Observation,
): PerspectiveDelta {
  const withSession = names(signedIn);
  const withoutSession = names(signedOut);

  return {
    signedInUrl: signedIn.url,
    signedOutUrl: signedOut.url,
    urlChanged: signedIn.url !== signedOut.url,
    signedInTitle: signedIn.title,
    signedOutTitle: signedOut.title,
    onlyWithSession: [...withSession]
      .filter((name) => !withoutSession.has(name))
      .slice(0, MAX_LISTED),
    onlyWithoutSession: [...withoutSession]
      .filter((name) => !withSession.has(name))
      .slice(0, MAX_LISTED),
    signedInControlCount: signedIn.controls.length,
    signedOutControlCount: signedOut.controls.length,
  };
}

export interface PerspectiveOptions {
  /** Defaults to the current tab's URL. */
  url?: string;
  tabId?: string;
  ledger?: Ledger;
  entityId?: string;
  intent?: string;
}

/**
 * Observe a URL with no session, and describe how it differs from the same URL as us.
 *
 * The isolated tab is always closed afterwards, so a comparison cannot quietly become a
 * second long-lived session.
 */
export async function viewWithoutSession(
  browser: BrowserPort,
  options: PerspectiveOptions = {},
): Promise<PerspectiveResult> {
  const signedIn = await browser.observe(options.tabId);
  const url = options.url ?? signedIn.url;

  const strangerTab = await browser.openIsolatedTab(url);
  try {
    const signedOut = await browser.observe(strangerTab);
    const delta = compareObservations(signedIn, signedOut);

    await options.ledger?.append({
      type: "probe",
      entityId: options.entityId,
      intent: options.intent ?? `view ${url} without a session`,
      before: {
        url: signedIn.url,
        title: signedIn.title,
        controls: signedIn.controls.length,
      },
      after: { url: signedOut.url, title: signedOut.title, changes: [] },
      // Recorded so an audit can reconstruct what the agent based its reasoning on.
      payload: { requested: url, delta },
    });

    return { signedOut, delta };
  } finally {
    await browser.closeTab(strangerTab);
  }
}
