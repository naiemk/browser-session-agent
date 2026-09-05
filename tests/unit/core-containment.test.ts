import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  excludeContained,
  isContained,
  isPropagatingElement,
  shouldExcludeContained,
  type ContainmentNode,
  type Rect,
} from "../../src/core/perception/containment.ts";

const box = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

const node = (partial: Partial<ContainmentNode> & Pick<ContainmentNode, "ref">): ContainmentNode => ({
  tag: "div",
  role: null,
  ariaLabel: "",
  hasOnclick: false,
  bounds: box(0, 0, 100, 100),
  descendants: [],
  ...partial,
});

describe("containment, as transcribed from browser-use cfe10a2", () => {
  it("treats 99% overlap as contained and anything under that as not", () => {
    const parent = box(0, 0, 100, 100);
    // 10x10 child fully inside.
    assert.equal(isContained(box(10, 10, 10, 10), parent), true);
    // A child that hangs 2% out.
    assert.equal(isContained(box(0, 0, 102, 100), parent), false);
    // Exactly the threshold: 99 of 100.
    assert.equal(isContained(box(0, 0, 100, 100), box(0, 0, 100, 99)), true);
    // Zero-area children are not contained. Their comment: "Zero-area element".
    assert.equal(isContained(box(10, 10, 0, 10), parent), false);
  });

  it("names the same propagating parents they do", () => {
    assert.equal(isPropagatingElement("a", null), true);
    assert.equal(isPropagatingElement("a", "button"), true);
    assert.equal(isPropagatingElement("button", "whatever"), true);
    assert.equal(isPropagatingElement("div", "button"), true);
    assert.equal(isPropagatingElement("div", "combobox"), true);
    assert.equal(isPropagatingElement("div", null), false);
    assert.equal(isPropagatingElement("span", "button"), true);
    assert.equal(isPropagatingElement("input", "combobox"), true);
  });

  it("keeps a contained child that hits any of their five exceptions", () => {
    assert.equal(shouldExcludeContained({ tag: "input", role: null, ariaLabel: "", hasOnclick: false }), false);
    assert.equal(shouldExcludeContained({ tag: "button", role: null, ariaLabel: "", hasOnclick: false }), false);
    assert.equal(shouldExcludeContained({ tag: "div", role: null, ariaLabel: "", hasOnclick: true }), false);
    assert.equal(shouldExcludeContained({ tag: "div", role: null, ariaLabel: "More", hasOnclick: false }), false);
    assert.equal(shouldExcludeContained({ tag: "div", role: "tab", ariaLabel: "", hasOnclick: false }), false);
    // role=listbox is collected by us and is not in their keep list.
    assert.equal(shouldExcludeContained({ tag: "div", role: "listbox", ariaLabel: "", hasOnclick: false }), true);
  });

  it("drops a nested listbox inside a link and keeps a nested button", () => {
    const link = node({
      ref: "e1",
      tag: "a",
      bounds: box(0, 0, 200, 40),
      descendants: ["e2", "e3"],
    });
    const listbox = node({
      ref: "e2",
      tag: "div",
      role: "listbox",
      bounds: box(4, 4, 16, 16),
    });
    const button = node({
      ref: "e3",
      tag: "button",
      bounds: box(160, 4, 32, 32),
    });

    const dropped = excludeContained([link, listbox, button]);
    assert.deepEqual([...dropped], ["e2"]);
  });

  it("does not drop a geometrically contained control that is not a descendant", () => {
    const link = node({
      ref: "e1",
      tag: "a",
      bounds: box(0, 0, 200, 40),
      descendants: [],
    });
    const other = node({
      ref: "e2",
      tag: "div",
      role: "listbox",
      bounds: box(4, 4, 16, 16),
      descendants: [],
    });
    assert.equal(excludeContained([link, other]).size, 0);
  });
});
