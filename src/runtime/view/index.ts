/**
 * What the model is shown, behind a seam.
 *
 * Every idea for cutting the browser agent's token bill — a hierarchical outline instead
 * of a flat control list, collapsing repeated rows, sending a delta instead of a page,
 * adopting Playwright's aria snapshot — is a different answer to one question: how should
 * a page be described to a model? Hard-coding one answer means the next one arrives as a
 * rewrite and lands unmeasured.
 *
 * So the answer is a strategy. `flatView` is what we ship today and the baseline every
 * alternative is measured against. A candidate implements the same interface, runs the
 * same suite, and either moves the numbers or does not.
 *
 * This lives in the runtime rather than in `src/optimize` on purpose: it is a production
 * hot path, and a hot path filed under "optimize" invites being treated as optional.
 */

import type { ActionResult, Observation, Verification } from "../../core/types.ts";
import {
  toWireActionResult,
  toWireObservation,
  toWireVerification,
  type WireObservation,
} from "../wire.ts";

export interface ViewStrategy {
  /** Named so a report can say which description was measured. */
  readonly name: string;
  // `object` rather than a concrete shape: a strategy is free to describe a page however
  // it likes, and callers only ever serialize or spread the result.
  observation(observation: Observation): object;
  actionResult(result: ActionResult): object;
  verification(verification: Verification): object;
}

/** Today's format: a flat control list with stable refs. The measurement baseline. */
export const flatView: ViewStrategy = {
  name: "flat",
  observation: (observation) => toWireObservation(observation),
  actionResult: (result) => toWireActionResult(result),
  verification: (verification) => toWireVerification(verification),
};

/**
 * A candidate, not the default: drop the snapshot from a successful action.
 *
 * The appeal is obvious, since a successful action's snapshot is pure repetition of a
 * page the model can already see. The catch is not obvious at all: refs go stale on every
 * action, so that snapshot is where the model gets the refs for its *next* action. Remove
 * it and the model must spend a whole extra turn observing, and a turn costs the card and
 * every tool schema again — which can easily exceed the snapshot it saved.
 *
 * Which way that lands depends on how often the model acts twice in a row, so it is a
 * measurement, not an argument. Kept here, off by default, until the numbers say.
 */
export const leanActionView: ViewStrategy = {
  ...flatView,
  name: "lean-actions",
  actionResult: (result) => {
    const wire = toWireActionResult(result) as { ok: boolean; observation?: WireObservation };
    if (!wire.ok) return wire;
    const { observation, ...rest } = wire;
    return {
      ...rest,
      url: observation?.url,
      title: observation?.title,
      changes: observation?.changes,
      note: "snapshot omitted because the action succeeded; observe for fresh refs",
    };
  },
};

export const VIEW_STRATEGIES: Record<string, ViewStrategy> = {
  [flatView.name]: flatView,
  [leanActionView.name]: leanActionView,
};

export function viewByName(name: string | undefined): ViewStrategy {
  if (!name) return flatView;
  const strategy = VIEW_STRATEGIES[name];
  if (!strategy) {
    throw new Error(
      `unknown view strategy "${name}". Available: ${Object.keys(VIEW_STRATEGIES).join(", ")}`,
    );
  }
  return strategy;
}
