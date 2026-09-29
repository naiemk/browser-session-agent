import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uniqueChooserHit } from "../../src/core/chooser.ts";
import type { Control } from "../../src/core/types.ts";

function control(partial: Partial<Control> & { ref: string; name: string }): Control {
  return { role: "clickable", tag: "div", ...partial };
}

describe("unique chooser commit", () => {
  const before = [control({ ref: "e1", role: "textbox", name: "City", tag: "input" })];

  it("clicks the one new control whose name contains the query", () => {
    const hit = control({ ref: "e2", name: "Tbilisi TBS", fresh: true });
    assert.equal(uniqueChooserHit("Tbilisi", before, [...before, hit]), hit);
  });

  it("does not guess when two new names contain the query", () => {
    const states = control({ ref: "e2", name: "United States", fresh: true });
    const america = control({ ref: "e3", name: "United States of America", fresh: true });
    assert.equal(uniqueChooserHit("United States", before, [...before, states, america]), undefined);
  });

  it("does not treat a JSON fill or a one-character query as a chooser", () => {
    const hit = control({ ref: "e2", name: "{ok}", fresh: true });
    assert.equal(uniqueChooserHit("{ok}", before, [...before, hit]), undefined);
    assert.equal(uniqueChooserHit("T", before, [...before, control({ ref: "e2", name: "Tbilisi" })]), undefined);
  });

  it("does not click a control that was already on the page", () => {
    const existing = control({ ref: "e9", name: "Tbilisi TBS" });
    assert.equal(uniqueChooserHit("Tbilisi", [existing], [existing]), undefined);
  });
});
