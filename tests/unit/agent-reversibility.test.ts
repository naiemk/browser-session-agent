import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAction } from "../../src/core/reversibility.ts";
import type { ActionRequest, Authorization, Control, Reversibility } from "../../src/core/types.ts";

function control(overrides: Partial<Control> = {}): Control {
  return { ref: "e1", role: "button", name: "Do it", tag: "button", ...overrides };
}

const CLICK: ActionRequest = { kind: "click", ref: "e1" };

/** name, control, recoverability, authorization. All of these are the same verb: click. */
const CLICKS: Array<[string, Control, Reversibility, Authorization]> = [
  ["Submit application", control({ name: "Submit application", submits: true }), "unknown", "outbound"],
  ["Send invitation", control({ name: "Send invitation" }), "unknown", "outbound"],
  ["Publish", control({ name: "Publish" }), "unknown", "outbound"],
  ["Post", control({ name: "Post" }), "unknown", "outbound"],
  ["Pay now", control({ name: "Pay now" }), "unknown", "outbound"],
  ["Place order", control({ name: "Place order" }), "unknown", "outbound"],
  ["Transfer funds", control({ name: "Transfer funds" }), "unknown", "outbound"],
  ["Delete account", control({ name: "Delete account" }), "unknown", "destructive"],
  ["Remove card", control({ name: "Remove card" }), "unknown", "destructive"],
  ["Revoke access", control({ name: "Revoke access" }), "unknown", "destructive"],
  ["Cancel subscription", control({ name: "Cancel subscription" }), "unknown", "destructive"],
  ["Unsubscribe", control({ name: "Unsubscribe" }), "unknown", "destructive"],
  ["Cancel", control({ name: "Cancel" }), "unknown", "none"],
  ["Discard", control({ name: "Discard draft" }), "unknown", "none"],

  ["Show more", control({ name: "Show more" }), "reversible", "none"],
  ["Expand details", control({ name: "Expand details" }), "reversible", "none"],
  ["Next page", control({ name: "Next page" }), "reversible", "none"],
  ["Filter results", control({ name: "Filter results" }), "reversible", "none"],
  ["Sort by date", control({ name: "Sort by date" }), "reversible", "none"],
  ["Open menu", control({ name: "Open menu" }), "reversible", "none"],
  ["Toggle dark mode", control({ name: "Toggle dark mode" }), "reversible", "none"],
  ["Search", control({ name: "Search", submits: true }), "reversible", "none"],
  ["Dismiss", control({ name: "Dismiss" }), "reversible", "none"],
  ["Maybe later", control({ name: "Maybe later" }), "reversible", "none"],
  ["Not now", control({ name: "Not now" }), "reversible", "none"],
  ["Skip", control({ name: "Skip" }), "reversible", "none"],
  ["Tags", control({ name: "Tags" }), "reversible", "none"],
  ["profile pic", control({ name: "profile pic" }), "reversible", "none"],
  ["Following", control({ name: "Following" }), "reversible", "none"],

  ["Import", control({ name: "Import" }), "unknown", "none"],

  [
    "a link",
    control({ name: "Careers", tag: "a", href: "https://example.test/jobs" }),
    "navigational",
    "none",
  ],
];

describe("AGENT-05-T01 reversibility judgment", () => {
  for (const [label, target, recoverability, authorization] of CLICKS) {
    it(`classifies clicking "${label}" as ${recoverability} / ${authorization}`, () => {
      const result = classifyAction(CLICK, target);
      assert.equal(result.reversibility, recoverability, result.reason);
      assert.equal(result.authorization, authorization, result.authorizationReason);
      assert.ok(result.reason.length > 0, "every classification carries an audit reason");
      assert.ok(result.authorizationReason.length > 0);
      assert.ok(result.ruleId.length > 0);
      assert.ok(result.authorizationRuleId.length > 0);
    });
  }

  it("gives the same verb different classes for different targets", () => {
    const submit = classifyAction(CLICK, control({ name: "Submit application", submits: true }));
    const expand = classifyAction(CLICK, control({ name: "Show more" }));
    assert.equal(submit.reversibility, "unknown");
    assert.equal(submit.authorization, "outbound");
    assert.equal(expand.reversibility, "reversible");
    assert.equal(expand.authorization, "none");
    assert.notEqual(submit.reason, expand.reason);
  });

  it("does not treat unmatched Import as a human ask", () => {
    const result = classifyAction(CLICK, control({ name: "Import" }));
    assert.equal(result.reversibility, "unknown");
    assert.equal(result.authorization, "none");
    assert.equal(result.ruleId, "unmatched");
    assert.equal(result.authorizationRuleId, "none");
  });

  it("splits a Users-like name from Send on the same click verb", () => {
    const users = classifyAction(CLICK, control({ name: "Users" }));
    const send = classifyAction(CLICK, control({ name: "Send" }));
    assert.equal(users.reversibility, "unknown");
    assert.equal(users.authorization, "none");
    assert.equal(send.reversibility, "unknown");
    assert.equal(send.authorization, "outbound");
    assert.equal(send.authorizationRuleId, "outbound-name");
  });

  it("treats an unnamed control as unknown, not authorized", () => {
    const result = classifyAction(CLICK, control({ name: "" }));
    assert.equal(result.reversibility, "unknown");
    assert.equal(result.authorization, "none");
    assert.match(result.reason, /unnamed/);
  });

  it("treats an undescribable target as unknown, not authorized", () => {
    const result = classifyAction(CLICK, undefined);
    assert.equal(result.reversibility, "unknown");
    assert.equal(result.authorization, "none");
    assert.match(result.reason, /unknown-target/);
  });

  it("treats an unrecognised name as unknown rather than guessing", () => {
    const result = classifyAction(CLICK, control({ name: "Frobnicate the widget" }));
    assert.equal(result.reversibility, "unknown");
    assert.equal(result.authorization, "none");
    assert.match(result.reason, /unmatched/);
  });

  it("classifies non-click kinds from the action itself", () => {
    assert.equal(classifyAction({ kind: "navigate", url: "x" }, undefined).reversibility, "navigational");
    assert.equal(classifyAction({ kind: "restore" }, undefined).reversibility, "navigational");
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
    assert.equal(classifyAction({ kind: "restore" }, undefined).authorization, "none");
  });

  it("prefers a destructive name over a benign one in the same label", () => {
    const result = classifyAction(CLICK, control({ name: "Remove selected items" }));
    assert.equal(result.reversibility, "unknown");
    assert.equal(result.authorization, "destructive");
  });

  it("does not let a submit button hide behind a benign word", () => {
    const result = classifyAction(CLICK, control({ name: "Save and submit", submits: true }));
    assert.equal(result.reversibility, "unknown");
    assert.equal(result.authorization, "outbound");
  });

  // Live TUI `goal_mtqh3r61001`: LinkedIn people-search. Shipping main parked on the
  // filter chip because unmatched used to mean committing. Invite is the commit.
  it("does not authorize a people-search filter chip (goal_mtqh3r61001)", () => {
    for (const name of ["Current companies", "All filters", "Actively hiring"]) {
      const result = classifyAction(CLICK, control({ name }));
      assert.equal(result.authorization, "none", name);
      assert.equal(result.authorizationRuleId, "none", name);
      assert.equal(result.reversibility, "unknown", name);
      assert.equal(result.ruleId, "unmatched", name);
    }
  });

  it("still authorizes Invite-to-connect as outbound (goal_mtqh3r61001)", () => {
    const result = classifyAction(CLICK, control({ name: "Invite Ali to connect" }));
    assert.equal(result.reversibility, "unknown");
    assert.equal(result.authorization, "outbound");
    assert.equal(result.authorizationRuleId, "outbound-name");
  });
});
