/**
 * How a page becomes an observation, behind a seam.
 *
 * There is more than one answer to "what is on this page", and the good ones are not
 * ours. Browser Use finds controls we are blind to - a `div` with a click listener and no
 * semantics, an icon with a pointer cursor - and discards controls we wrongly offer, like
 * everything sitting under an open modal. Adopting any of that as a rewrite of the one
 * collector we have would land it unmeasured and make the next upstream improvement a
 * second rewrite.
 *
 * So perception is a strategy, exactly as the description of a page already is
 * (`ViewStrategy`). `reference` is what we shipped before this seam existed and stays the
 * baseline every candidate is measured against.
 *
 * The seam is deliberately not just `observe`. A ref is not data: it is a promise that
 * whatever minted it can hand the element back. Ours are `data-core-ref` attributes found
 * by a CSS selector; a CDP-based perceiver's would be `backendNodeId` integers with no
 * CSS address at all. Split perception from resolution and swapping the first silently
 * breaks the second, so they are one interface.
 */

import type { Locator, Page } from "playwright";
import type { PerceiveContext } from "../perceive.ts";
import type { Observation } from "../types.ts";
import { leanPerceiver } from "./lean.ts";
import { referencePerceiver } from "./reference.ts";

/**
 * What a perceiver can see, so a report and a test can say so.
 *
 * Not aspiration: a claim here means the stage that provides it ran. `occlusion: false`
 * says this perceiver will list controls buried under a dialog, which is a fact a
 * measurement needs and a reason a conformance test skips a case rather than fails it.
 */
export interface PerceiverCapabilities {
  /** Controls that cannot receive a click are left out. */
  occlusion: boolean;
  /** Controls inside shadow roots are found. */
  shadowDom: boolean;
  /** Controls inside iframes are found. */
  frames: boolean;
}

export interface Perceiver {
  /** Named so a report can say which perception was measured. */
  readonly name: string;
  readonly capabilities: PerceiverCapabilities;
  observe(page: Page, context: PerceiveContext): Promise<Observation>;
  /** The page as readable text, for predicates. */
  text(page: Page): Promise<string>;
  /**
   * Turn a ref back into something actionable.
   *
   * Only the perceiver that minted the ref can do this, which is why it lives here and
   * not next to the actions that call it.
   */
  locate(page: Page, ref: string): Locator;
}

export { leanPerceiver, referencePerceiver };

/**
 * The perceivers a run can choose between, by name.
 *
 * Selectable rather than compiled in, because a candidate that cannot be switched on for
 * one suite run and off for the next cannot be compared against anything.
 */
export const PERCEIVERS: Record<string, Perceiver> = {
  [referencePerceiver.name]: referencePerceiver,
  [leanPerceiver.name]: leanPerceiver,
};

export const DEFAULT_PERCEIVER: Perceiver = referencePerceiver;

/** Resolve a name, falling back to the default so a typo is not a crash mid-run. */
export function perceiverByName(name?: string): Perceiver {
  if (!name) return DEFAULT_PERCEIVER;
  return PERCEIVERS[name] ?? DEFAULT_PERCEIVER;
}
