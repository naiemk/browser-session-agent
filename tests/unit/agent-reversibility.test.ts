import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAction } from "../../src/core/reversibility.ts";
import type { ActionRequest, Control, Reversibility } from "../../src/core/types.ts";

function control(overrides: Partial<Control> = {}): Control {
  return { ref: "e1", role: "button", name: "Do it", tag: "button", ...overrides };
}

const CLICK: ActionRequest = { kind: "click", ref: "e1" };

/** name, control, expected class. All of these are the same verb: click. */
const CLICKS: Array<[string, Control, Reversibility]> = [
  ["Submit application", control({ name: "Submit application", submits: true }), "committing"],
  ["Send invitation", control({ name: "Send invitation" }), "committing"],
  ["Publish", control({ name: "Publish" }), "committing"],
  ["Post", control({ name: "Post" }), "committing"],
  ["Pay now", control({ name: "Pay now" }), "committing"],
  ["Place order", control({ name: "Place order" }), "committing"],
  ["Transfer funds", control({ name: "Transfer funds" }), "committing"],
  ["Delete account", control({ name: "Delete account" }), "committing"],
  ["Remove card", control({ name: "Remove card" }), "committing"],
  ["Revoke access", control({ name: "Revoke access" }), "committing"],
  ["Cancel subscription", control({ name: "Cancel subscription" }), "committing"],
  ["Unsubscribe", control({ name: "Unsubscribe" }), "committing"],
  ["Cancel", control({ name: "Cancel" }), "committing"],
  ["Discard", control({ name: "Discard draft" }), "committing"],

  ["Show more", control({ name: "Show more" }), "reversible"],
  ["Expand details", control({ name: "Expand details" }), "reversible"],
  ["Next page", control({ name: "Next page" }), "reversible"],
  ["Filter results", control({ name: "Filter results" }), "reversible"],
  ["Sort by date", control({ name: "Sort by date" }), "reversible"],
  ["Open menu", control({ name: "Open menu" }), "reversible"],
  ["Toggle dark mode", control({ name: "Toggle dark mode" }), "reversible"],

  ["a link", control({ name: "Careers", tag: "a", href: "https://example.test/jobs" }), "navigational"],
];

describe("AGENT-05-T01 reversibility judgment", () => {
  for (const [label, target, expected] of CLICKS) {
    it(`classifies clicking "${label}" as ${expected}`, () => {
      const result = classifyAction(CLICK, target);
      assert.equal(result.reversibility, expected, result.reason);
      assert.ok(result.reason.length > 0, "every classification carries an audit reason");
    });
  }

  it("gives the same verb different classes for different targets", () => {
    const submit = classifyAction(CLICK, control({ name: "Submit application", submits: true }));
    const expand = classifyAction(CLICK, control({ name: "Show more" }));
    assert.equal(submit.reversibility, "committing");
    assert.equal(expand.reversibility, "reversible");
    assert.notEqual(submit.reason, expand.reason);
  });

  it("treats an unnamed control as committing", () => {
    const result = classifyAction(CLICK, control({ name: "" }));
    assert.equal(result.reversibility, "committing");
    assert.match(result.reason, /unnamed/);
  });

  it("treats an undescribable target as committing", () => {
    const result = classifyAction(CLICK, undefined);
    assert.equal(result.reversibility, "committing");
    assert.match(result.reason, /unknown-target/);
  });

  it("treats an unrecognised name as committing rather than guessing", () => {
    const result = classifyAction(CLICK, control({ name: "Frobnicate the widget" }));
    assert.equal(result.reversibility, "committing");
    assert.match(result.reason, /unmatched/);
  });

  it("classifies non-click kinds from the action itself", () => {
    assert.equal(classifyAction({ kind: "navigate", url: "x" }, undefined).reversibility, "navigational");
    assert.equal(classifyAction({ kind: "wait" }, undefined).reversibility, "reversible");
    assert.equal(classifyAction({ kind: "scroll" }, undefined).reversibility, "reversible");
    assert.equal(classifyAction({ kind: "check" }, undefined).reversibility, "probe");
    assert.equal(
      classifyAction({ kind: "type", ref: "e1", text: "x" }, control({ name: "Email" })).reversibility,
      "reversible",
    );
    assert.equal(
      classifyAction({ kind: "select", ref: "e1", value: "x" }, control({ name: "Location" })).reversibility,
      "reversible",
    );
    assert.equal(
      classifyAction({ kind: "upload", ref: "e1", files: [] }, control({ name: "Resume" })).reversibility,
      "reversible",
    );
  });

  it("prefers a destructive name over a benign one in the same label", () => {
    // "Remove" wins over "selected": destructive reads come first on purpose.
    const result = classifyAction(CLICK, control({ name: "Remove selected items" }));
    assert.equal(result.reversibility, "committing");
  });

  it("does not let a submit button hide behind a benign word", () => {
    const result = classifyAction(CLICK, control({ name: "Save and submit", submits: true }));
    assert.equal(result.reversibility, "committing");
  });
});
