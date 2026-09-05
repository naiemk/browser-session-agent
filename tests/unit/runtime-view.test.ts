import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Observation } from "../../src/core/types.ts";
import { flatView, tableView, VIEW_STRATEGIES, viewByName } from "../../src/runtime/view/index.ts";
import { formatControls, parseControls } from "../../src/runtime/view/table.ts";
import { toWireObservation, wireText, type WireControl } from "../../src/runtime/wire.ts";

function observation(controls: Observation["controls"]): Observation {
  return {
    id: "obs_1",
    tabId: "tab_1",
    url: "https://example.com/list",
    title: "List",
    controls,
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };
}

const AWKWARD: WireControl[] = [
  { ref: "e1", role: "link", name: "Home" },
  { ref: "e2", role: "textbox", name: "Search", value: "Minsk", required: true },
  { ref: "e3", role: "checkbox", name: "Agree", checked: true, disabled: true, submits: true },
  // The characters the encoding has to survive, since a textarea can hold any of them.
  { ref: "e4", role: "textbox", name: "Notes", value: "line one\nline two\tindented \\ done" },
  { ref: "e5", role: "link", name: "v_varvar", row: "v_varvar Varya Kuznetsova Follow" },
  { ref: "e6", role: "link", name: "" },
  { ref: "e7", role: "link", name: "value=not a value" },
];

describe("describing a page as a table", () => {
  it("round-trips every field, because a cheaper description of a different page is no use", () => {
    assert.deepEqual(parseControls(formatControls(AWKWARD)), AWKWARD);
  });

  it("survives an empty list", () => {
    assert.deepEqual(parseControls(formatControls([])), []);
  });

  it("costs less than the objects it replaces", () => {
    const table = wireText({ controls: formatControls(AWKWARD) }).length;
    const objects = wireText({ controls: AWKWARD }).length;
    assert.ok(table < objects * 0.8, `table ${table} vs objects ${objects}`);
  });

  it("says the field names nowhere", () => {
    const text = formatControls(AWKWARD);
    assert.equal(text.includes('"ref"'), false);
    assert.equal(text.includes('"role"'), false);
  });
});

describe("every view can be read back", () => {
  const page = observation([
    { ref: "e1", role: "link", name: "member1", tag: "a" },
    { ref: "e2", role: "textbox", name: "Search", tag: "input", value: "x" },
  ]);

  for (const [name, view] of Object.entries(VIEW_STRATEGIES)) {
    it(`${name} reads its own snapshot back out of a reply`, () => {
      const read = view.readObservation(wireText(view.observation(page)));
      assert.ok(read, "a description nothing can read cannot be measured on the suite");
      assert.deepEqual(read.controls, toWireObservation(page).controls);
    });

    it(`${name} treats a page the agent is not on as billed but not live`, () => {
      // A peek reports a page it has already closed. Its refs address a tab that no
      // longer exists, so resolving a target against them sends the next action at a
      // ghost - but it was sent, so it is still counted.
      const peek = wireText({ page: view.observation(page), stillOn: "https://example.com" });

      assert.equal(view.readObservation(peek), undefined);
      assert.ok(view.anySnapshot(peek), "a peeked page costs tokens too");
    });

    it(`${name} measures a snapshot in the format it sends`, () => {
      const read = view.readObservation(wireText(view.observation(page)))!;
      assert.equal(view.sizeOf(read), wireText(view.observation(page)).length);
    });
  }

  it("does not confuse one view's snapshot for another's", () => {
    const asTable = wireText(tableView.observation(page));
    assert.equal(flatView.readObservation(asTable), undefined);
    assert.equal(tableView.readObservation(wireText(flatView.observation(page))), undefined);
  });

  it("names an unknown view rather than silently falling back", () => {
    assert.equal(viewByName(undefined), flatView);
    assert.throws(() => viewByName("outline"), /unknown view strategy/);
  });
});
