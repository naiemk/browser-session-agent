import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluatePredicate, verify } from "../../src/core/predicates.ts";
import { describeVerification } from "../../src/core/settle.ts";
import { toWireVerification } from "../../src/runtime/wire.ts";
import type { Control, Observation, PageFacts, Predicate } from "../../src/core/types.ts";

function control(over: Partial<Control> = {}): Control {
  return { ref: "e1", role: "link", name: "Profile", tag: "a", ...over };
}

function facts(over: { text?: string; controls?: Control[] } = {}): PageFacts {
  const observation: Observation = {
    id: "obs_1",
    tabId: "tab_1",
    url: "https://example.com/list",
    title: "List",
    controls: over.controls ?? [control()],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };
  return { url: observation.url, title: observation.title, text: over.text ?? "Hello", observation };
}

/** The line the model reads: the verdict and the reason for it, together. */
function line(pred: Predicate, page: PageFacts): string {
  const wire = toWireVerification(verify([pred], page));
  return wire.checks[0]!;
}

/** The line the ledger keeps, which carries the reason without the verdict. */
function ledgerLine(pred: Predicate, page: PageFacts): string {
  return describeVerification(verify([pred], page));
}

describe("a check explains itself without contradicting itself", () => {
  it("never says 'not found' about text it just found", () => {
    const page = facts({ text: "Followers viktoria_majmuna Follow" });
    const passed = line({ kind: "text_visible", text: "viktoria_majmuna" }, page);

    assert.match(passed, /^pass /);
    assert.doesNotMatch(
      passed,
      /not found|no match/,
      `a passing check read as a failure to the model: ${passed}`,
    );
    assert.match(passed, /found in "/, "and it says where, so the match can be judged");

    // The ledger keeps the reason without the verdict, so it must not read as a failure
    // beside an outcome of ok.
    assert.doesNotMatch(
      ledgerLine({ kind: "text_visible", text: "viktoria_majmuna" }, page),
      /not found|no match/,
    );
  });

  it("says what it looked through when it does not find the text", () => {
    const failed = line({ kind: "text_visible", text: "varya" }, facts({ text: "Followers" }));
    assert.match(failed, /^FAIL /);
    assert.match(failed, /no match in \d+ characters/);
  });

  it("reads a row as visible, because the agent can see it", () => {
    // A list splits one identity across siblings: the handle in the anchor, the display
    // name in the span beside it. Only the row carries both.
    const page = facts({
      text: "Followers",
      controls: [control({ name: "v_varvar", row: "v_varvar Varya Follow" })],
    });
    assert.equal(evaluatePredicate({ kind: "text_visible", text: "Varya" }, page).passed, true);
  });

  it("counts a typed value and a control's own name as visible", () => {
    const page = facts({
      text: "Search",
      controls: [control({ role: "textbox", name: "Search input", value: "Minsk" })],
    });
    assert.equal(evaluatePredicate({ kind: "text_visible", text: "Minsk" }, page).passed, true);
    assert.equal(evaluatePredicate({ kind: "text_visible", text: "Search input" }, page).passed, true);
  });

  it("answers ref_exists with a yes or a no, not with the whole ref table", () => {
    const controls = Array.from({ length: 80 }, (_, index) => control({ ref: `e${index + 1}` }));
    const page = facts({ controls });

    const present = evaluatePredicate({ kind: "ref_exists", ref: "e41" }, page);
    assert.equal(present.passed, true);
    assert.equal(present.detail, "present");

    const absent = evaluatePredicate({ kind: "ref_exists", ref: "e999" }, page);
    assert.equal(absent.passed, false);
    assert.ok(absent.detail.length < 40, `a boolean cost ${absent.detail.length} bytes to answer`);
  });

  it("names the control it found, and says absent when there is none", () => {
    const page = facts({ controls: [control({ ref: "e7", role: "button", name: "Follow" })] });
    assert.match(
      evaluatePredicate({ kind: "control_exists", role: "button", name: "Follow" }, page).detail,
      /e7 button "Follow"/,
    );
    assert.equal(
      evaluatePredicate({ kind: "control_absent", role: "button", name: "Unfollow" }, page).detail,
      "absent",
    );
  });

  it("keeps the negation in the label when a predicate is inverted", () => {
    const page = facts({ text: "Followers" });
    const passed = line({ kind: "not", of: { kind: "text_visible", text: "varya" } }, page);
    assert.match(passed, /^pass not \(text visible "varya"\)/);
    assert.match(passed, /no match/, "and the reason describes the inner observation");
  });
});
