/**
 * Drop children that live inside a control the agent already has.
 *
 * Ported from `browser_use/dom/serializer/serializer.py` at cfe10a2
 * (browser-use/browser-use, MIT, Copyright (c) 2024 Gregor Zunic). Names and constants
 * are theirs on purpose: `git diff cfe10a2..HEAD -- browser_use/dom/serializer/serializer.py`
 * is then a literal to-do list against this file.
 *
 * Their tree includes every node, so this stage mostly drops icons and wrappers inside
 * buttons. Our collector only lists interactive controls, and most of those hit one of
 * the five exception rules below, so on today's collector this is nearly a no-op. It
 * still belongs here: the first additive perceiver will start finding the nodes this
 * was written to discard, and a stage we already measure is how that lands cleanly.
 */

import type { Page } from "playwright";
import { REF_ATTR } from "../perceive.ts";
import type { Control } from "../types.ts";

/** 99% of the child area must lie inside the parent. Their number, kept. */
export const DEFAULT_CONTAINMENT_THRESHOLD = 0.99;

/**
 * Parents whose bounds propagate to descendants.
 *
 * A `role` of null means any role. Duplicated `input`/`combobox` is upstream's list as
 * of cfe10a2, including the comment they left on the second copy.
 */
export const PROPAGATING_ELEMENTS: ReadonlyArray<{ tag: string; role: string | null }> = [
  { tag: "a", role: null },
  { tag: "button", role: null },
  { tag: "div", role: "button" },
  { tag: "div", role: "combobox" },
  { tag: "span", role: "button" },
  { tag: "span", role: "combobox" },
  { tag: "input", role: "combobox" },
  { tag: "input", role: "combobox" },
];

const KEEP_CHILD_TAGS = new Set(["input", "select", "textarea", "label"]);
const KEEP_CHILD_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "option",
]);

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContainmentNode {
  ref: string;
  tag: string;
  role: string | null;
  ariaLabel: string;
  hasOnclick: boolean;
  bounds: Rect;
  /** Refs of collected controls this node contains in the DOM. */
  descendants: string[];
}

export function isPropagatingElement(tag: string, role: string | null): boolean {
  const lower = tag.toLowerCase();
  return PROPAGATING_ELEMENTS.some(
    (entry) => entry.tag === lower && (entry.role === null || entry.role === role),
  );
}

/**
 * Their `_is_contained`: intersection area over child area, against the threshold.
 */
export function isContained(child: Rect, parent: Rect, threshold = DEFAULT_CONTAINMENT_THRESHOLD): boolean {
  const xOverlap = Math.max(0, Math.min(child.x + child.width, parent.x + parent.width) - Math.max(child.x, parent.x));
  const yOverlap = Math.max(
    0,
    Math.min(child.y + child.height, parent.y + parent.height) - Math.max(child.y, parent.y),
  );
  const intersection = xOverlap * yOverlap;
  const childArea = child.width * child.height;
  if (childArea === 0) return false;
  return intersection / childArea >= threshold;
}

/**
 * Their exception list: a contained child that matches any of these is kept.
 *
 * 1. form elements (they need individual interaction)
 * 2. the child is itself a propagating element (might have stopPropagation)
 * 3. explicit onclick
 * 4. a non-empty aria-label
 * 5. a role that means the child is independently interactive
 */
export function shouldExcludeContained(node: {
  tag: string;
  role: string | null;
  ariaLabel: string;
  hasOnclick: boolean;
}): boolean {
  const tag = node.tag.toLowerCase();
  if (KEEP_CHILD_TAGS.has(tag)) return false;
  if (isPropagatingElement(tag, node.role)) return false;
  if (node.hasOnclick) return false;
  if (node.ariaLabel.trim()) return false;
  if (node.role && KEEP_CHILD_ROLES.has(node.role)) return false;
  return true;
}

const READ_NODES = `({ refs, attr }) => {
  const nodes = [];
  const elements = refs.map((ref) => document.querySelector("[" + attr + '="' + ref + '"]'));
  for (let i = 0; i < refs.length; i++) {
    const el = elements[i];
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const descendants = [];
    for (let j = 0; j < refs.length; j++) {
      if (i === j) continue;
      const other = elements[j];
      if (other && el.contains(other)) descendants.push(refs[j]);
    }
    nodes.push({
      ref: refs[i],
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label") || "",
      hasOnclick: el.hasAttribute("onclick"),
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      descendants,
    });
  }
  return nodes;
}`;

/**
 * Apply the transcribed filter to a collected list.
 *
 * Geometry and ancestry both have to hold: two overlapping controls that are not
 * nested are not a parent and a child, and dropping one of them would be a different
 * algorithm.
 */
export function excludeContained(nodes: readonly ContainmentNode[]): Set<string> {
  const byRef = new Map(nodes.map((node) => [node.ref, node]));
  const excluded = new Set<string>();
  for (const parent of nodes) {
    if (!isPropagatingElement(parent.tag, parent.role)) continue;
    for (const childRef of parent.descendants) {
      const child = byRef.get(childRef);
      if (!child) continue;
      if (!isContained(child.bounds, parent.bounds)) continue;
      if (shouldExcludeContained(child)) excluded.add(child.ref);
    }
  }
  return excluded;
}

export async function dropContained(
  controls: readonly Control[],
  page: Page,
): Promise<{ controls: Control[]; dropped: number }> {
  if (controls.length === 0) return { controls: [], dropped: 0 };
  const refs = controls.map((control) => control.ref);
  const nodes = (await page.evaluate(
    `(${READ_NODES})(${JSON.stringify({ refs, attr: REF_ATTR })})`,
  )) as ContainmentNode[];
  const excluded = excludeContained(nodes);
  const kept = controls.filter((control) => !excluded.has(control.ref));
  return { controls: kept, dropped: controls.length - kept.length };
}
