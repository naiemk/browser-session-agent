/**
 * Today's collector, minus the controls a person would not try to click.
 *
 * The two stages are Browser Use's subtractive filters, in the order they run them:
 * containment first (children of a control we already have), then occlusion (controls
 * a click would not reach). Both run before the budget, so a buried nav link does not
 * keep a slot that belongs to the list sitting on top of it.
 *
 * Named `lean` rather than `browser-use` because the collector is still ours. What we
 * took is the two filters, not their pipeline.
 */

import type { Locator, Page } from "playwright";
import { perceive, type PerceiveContext } from "../perceive.ts";
import type { Control, Observation } from "../types.ts";
import { dropContained } from "./containment.ts";
import type { Perceiver } from "./index.ts";
import { dropOccluded } from "./occlusion.ts";
import { referencePerceiver } from "./reference.ts";

export const leanPerceiver: Perceiver = {
  name: "lean",
  capabilities: {
    occlusion: true,
    shadowDom: false,
    frames: false,
  },

  async observe(page: Page, context: PerceiveContext): Promise<Observation> {
    const dropped = { containment: 0, occlusion: 0 };
    const observation = await perceive(page, context, async (controls, onPage) => {
      const contained = await dropContained(controls, onPage);
      dropped.containment = contained.dropped;
      const occluded = await dropOccluded(contained.controls, onPage);
      dropped.occlusion = occluded.dropped;
      return occluded.controls;
    });
    return { ...observation, perception: { perceiver: "lean", dropped } };
  },

  text(page: Page): Promise<string> {
    return referencePerceiver.text(page);
  },

  locate(page: Page, ref: string): Locator {
    return referencePerceiver.locate(page, ref);
  },
};

/** Exposed so a unit test can run the pair without a page. */
export async function applyLeanFilters(
  controls: Control[],
  page: Page,
): Promise<{ controls: Control[]; dropped: { containment: number; occlusion: number } }> {
  const contained = await dropContained(controls, page);
  const occluded = await dropOccluded(contained.controls, page);
  return {
    controls: occluded.controls,
    dropped: { containment: contained.dropped, occlusion: occluded.dropped },
  };
}
