/**
 * Whether a control can actually receive a click.
 *
 * Browser Use answers this from a paint-order union of opaque rectangles
 * (`browser_use/dom/serializer/paint_order.py`, ported from cfe10a2). They have to:
 * their tree is a static CDP snapshot, so they cannot ask the browser what is on top.
 * We run JS in the page, so we can. `document.elementFromPoint` is the native hit test —
 * stacking, `pointer-events`, overlays — and it answers the question we actually care
 * about: would a click here reach this control.
 *
 * Their algorithm is kept as the fallback for a future CDP perceiver that cannot
 * hit-test. This file is the better answer for a perceiver that can.
 *
 * Off-viewport is not occluded. `elementFromPoint` returns null outside the viewport,
 * and "I could not ask" is not "no". Same asymmetry as D50: do not act on a negative
 * you cannot confirm.
 */

import type { Page } from "playwright";
import { REF_ATTR } from "../perceive.ts";
import type { Control } from "../types.ts";

const HIT_TEST = `({ refs, attr }) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const occluded = [];
  for (const ref of refs) {
    const el = document.querySelector("[" + attr + '="' + ref + '"]');
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const samples = [
      [cx, cy],
      [rect.left + rect.width * 0.25, cy],
      [rect.left + rect.width * 0.75, cy],
    ];
    const blocked = samples.every(([x, y]) => {
      if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return false;
      const top = document.elementFromPoint(x, y);
      if (!top) return false;
      return top !== el && !el.contains(top);
    });
    if (blocked) occluded.push(ref);
  }
  return occluded;
}`;

/**
 * Drop controls a click would not reach.
 *
 * Returns the survivors and how many were dropped, so a report can say what this stage
 * bought without the caller having to diff two lists.
 */
export async function dropOccluded(
  controls: readonly Control[],
  page: Page,
): Promise<{ controls: Control[]; dropped: number }> {
  if (controls.length === 0) return { controls: [], dropped: 0 };
  const occluded = new Set(
    (await page.evaluate(
      `(${HIT_TEST})(${JSON.stringify({ refs: controls.map((control) => control.ref), attr: REF_ATTR })})`,
    )) as string[],
  );
  const kept = controls.filter((control) => !occluded.has(control.ref));
  return { controls: kept, dropped: controls.length - kept.length };
}
