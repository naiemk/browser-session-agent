/**
 * The perception we already had, named so it can be measured against.
 *
 * This is a wrapper and nothing more. Every behaviour lives in
 * [perceive.ts](../perceive.ts), which was learned from real pages over a long time -
 * zero-sized editors that must survive, Monaco values read through the editor API,
 * passwords redacted before they leave the page, refs that belong to an element for as
 * long as the element lasts. None of that is re-expressed here, because a second copy of
 * hard-won behaviour is how the two copies start disagreeing.
 *
 * Wrapping rather than moving is also what keeps this change out of everyone else's way:
 * the collector is under active edit for unrelated reasons, and a port that rewrote it
 * would collide with work already in flight.
 */

import type { Locator, Page } from "playwright";
import { perceive, refSelector, visibleText, type PerceiveContext } from "../perceive.ts";
import type { Observation } from "../types.ts";
import type { Perceiver } from "./index.ts";

export const referencePerceiver: Perceiver = {
  name: "reference",
  capabilities: {
    // All three are honest admissions rather than todos. `document.querySelectorAll` does
    // not pierce shadow roots and does not cross into frames, and nothing in the
    // collector asks whether a control could actually receive a click.
    occlusion: false,
    shadowDom: false,
    frames: false,
  },

  observe(page: Page, context: PerceiveContext): Promise<Observation> {
    return perceive(page, context);
  },

  text(page: Page): Promise<string> {
    return visibleText(page);
  },

  locate(page: Page, ref: string): Locator {
    return page.locator(refSelector(ref)).first();
  },
};
