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
  findSnapshot,
  wireText,
  type WireObservation,
} from "../wire.ts";
import { formatControls, parseControls, TABLE_LEGEND } from "./table.ts";

export interface ViewStrategy {
  /** Named so a report can say which description was measured. */
  readonly name: string;
  // `object` rather than a concrete shape: a strategy is free to describe a page however
  // it likes, and callers only ever serialize or spread the result.
  observation(observation: Observation): object;
  actionResult(result: ActionResult): object;
  verification(verification: Verification): object;
  /**
   * The snapshot in this reply whose refs are live: the page the reply is about, or the
   * page an action left behind.
   *
   * Required, not optional. The mock model resolves a named target against the newest
   * snapshot in the transcript, so a description nothing can read back is a description
   * that cannot be run on the token-free suite - which is the only place a candidate gets
   * measured before it costs anyone real tokens.
   *
   * Deliberately not every snapshot a reply contains. A peek reports a page it has
   * already closed and says which page you are still on; its refs address a tab that no
   * longer exists, and treating them as live sends the next action at a ghost.
   */
  readObservation(text: string): WireObservation | undefined;
  /**
   * Any snapshot in this reply, live or not, for metering.
   *
   * The other question: a peeked page is not somewhere the agent can act, but it was
   * still sent and still billed, so it is still counted.
   */
  anySnapshot(text: string): WireObservation | undefined;
  /**
   * How large a snapshot is in this view's own format.
   *
   * Asked of the view because only the view knows what it writes. Measuring a parsed
   * snapshot as JSON would report every candidate as costing exactly what the baseline
   * costs, which is a comparison of one description measured twice.
   */
  sizeOf(observation: WireObservation): number;
  /** A line for the card, when the format needs explaining. Paid once per turn. */
  readonly legend?: string;
}

/**
 * Reading snapshots back out of a reply, given how this view writes a control list.
 *
 * Shared because the search is the same for every format and only the shape of the
 * control list differs - and because writing it twice is how the two views came to
 * disagree about where a live snapshot can be.
 */
function decoding(
  controls: (value: unknown) => boolean,
  decode: (found: Record<string, unknown>) => WireObservation,
): Pick<ViewStrategy, "readObservation" | "anySnapshot"> {
  const json = (text: string): Record<string, unknown> | undefined => {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };
  const here = (value: unknown): Record<string, unknown> | undefined =>
    findSnapshot(value, controls) === value ? (value as Record<string, unknown>) : undefined;

  return {
    readObservation: (text) => {
      const parsed = json(text);
      if (!parsed) return undefined;
      // The reply's own page, or the page the action left us on. Nowhere else.
      const live = here(parsed) ?? here(parsed.observation);
      return live ? decode(live) : undefined;
    },
    anySnapshot: (text) => {
      const parsed = json(text);
      const found = parsed ? findSnapshot(parsed, controls) : undefined;
      return found ? decode(found) : undefined;
    },
  };
}

/** Today's format: a flat control list with stable refs. The measurement baseline. */
export const flatView: ViewStrategy = {
  name: "flat",
  observation: (observation) => toWireObservation(observation),
  actionResult: (result) => toWireActionResult(result),
  verification: (verification) => toWireVerification(verification),
  ...decoding(Array.isArray, (found) => found as unknown as WireObservation),
  sizeOf: (observation) => wireText(observation).length,
};

/**
 * The same page, with the control list as a table. The default.
 *
 * Only the `controls` field changes shape, which is deliberate: it was the largest share
 * of the model's context and the rest of a reply is a handful of fields that objects
 * describe well. On the token-free suite it cut tool result bytes by 22.7% at 29/29
 * passing, on fixture pages carrying a handful of controls each - which is where the
 * format has the least to save, since what it saves is per row.
 *
 * The residual risk is the one the suite cannot cover: the mock reads a table back
 * perfectly, and whether a real model does is a question only a real run answers. So it
 * is the default, because a default is the only thing the next real run measures, and
 * `--view flat` or `BSA_VIEW=flat` puts the baseline back in one word.
 */
export const tableView: ViewStrategy = {
  name: "table",
  legend: TABLE_LEGEND,
  observation: (observation) => tabulate(toWireObservation(observation)),
  actionResult: (result) => {
    const wire = toWireActionResult(result) as { observation?: WireObservation };
    if (!wire.observation) return wire;
    return { ...wire, observation: tabulate(wire.observation) };
  },
  verification: (verification) => toWireVerification(verification),
  ...decoding(
    (controls) => typeof controls === "string",
    (found) =>
      ({ ...found, controls: parseControls(found.controls as string) }) as unknown as WireObservation,
  ),
  sizeOf: (observation) => wireText(tabulate(observation)).length,
};

function tabulate(wire: WireObservation): object {
  return { ...wire, controls: formatControls(wire.controls) };
}

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
  [tableView.name]: tableView,
  [leanActionView.name]: leanActionView,
};

/**
 * What every composition root uses when nobody chose.
 *
 * One constant rather than a default per caller: the tools and the mock model have to
 * agree about the format, and two independent `?? flatView` defaults are how they would
 * come to disagree.
 */
export const DEFAULT_VIEW = tableView;

export function viewByName(name: string | undefined): ViewStrategy {
  if (!name) return DEFAULT_VIEW;
  const strategy = VIEW_STRATEGIES[name];
  if (!strategy) {
    throw new Error(
      `unknown view strategy "${name}". Available: ${Object.keys(VIEW_STRATEGIES).join(", ")}`,
    );
  }
  return strategy;
}
