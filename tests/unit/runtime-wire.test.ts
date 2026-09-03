import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActionResult, Control, Observation } from "../../src/core/types.ts";
import {
  MAX_WIRE_CONTROLS,
  toWireActionResult,
  toWireObservation,
  wireText,
} from "../../src/runtime/wire.ts";

function control(overrides: Partial<Control> = {}): Control {
  return { ref: "e1", role: "text", name: "Full name", tag: "input", ...overrides };
}

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://fixture.test/apply",
    title: "Apply",
    controls: [control()],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("what the model sees", () => {
  it("drops empty fields rather than sending nulls", () => {
    const wire = toWireObservation(observation());
    assert.deepEqual(Object.keys(wire).sort(), ["controls", "title", "url"]);
    assert.deepEqual(Object.keys(wire.controls[0]!).sort(), ["name", "ref", "role"]);
  });

  it("includes flags only when they are true", () => {
    const wire = toWireObservation(
      observation({
        controls: [
          control({ required: true, disabled: false, value: "Ada" }),
          control({ ref: "e2", name: "Submit", role: "submit", submits: true }),
        ],
      }),
    );
    assert.deepEqual(wire.controls[0], {
      ref: "e1",
      role: "text",
      name: "Full name",
      value: "Ada",
      required: true,
    });
    assert.equal("disabled" in wire.controls[0]!, false);
    assert.equal(wire.controls[1]!.submits, true);
  });

  it("keeps errors and changes when present", () => {
    const wire = toWireObservation(
      observation({
        errors: ["Name is required"],
        consoleErrors: ["a", "b", "c", "d"],
        changes: ["added button Submit"],
      }),
    );
    assert.deepEqual(wire.errors, ["Name is required"]);
    assert.deepEqual(wire.consoleErrors, ["b", "c", "d"], "only the most recent few");
    assert.deepEqual(wire.changes, ["added button Submit"]);
  });

  it("caps a crowded page and says how many were withheld", () => {
    const controls = Array.from({ length: MAX_WIRE_CONTROLS + 5 }, (_, index) =>
      control({ ref: `e${index}`, name: `Field ${index}` }),
    );
    const wire = toWireObservation(observation({ controls }));
    assert.equal(wire.controls.length, MAX_WIRE_CONTROLS);
    assert.match(wire.note ?? "", /5 more controls not shown/);
  });

  it("clips long strings so one verbose label cannot dominate a turn", () => {
    const wire = toWireObservation(observation({ controls: [control({ name: "x".repeat(500) })] }));
    assert.ok(wire.controls[0]!.name.length < 130);
    assert.match(wire.controls[0]!.name, /…$/);
  });

  it("explains a failure and stays quiet on success", () => {
    const base: ActionResult = {
      ok: true,
      kind: "click",
      reversibility: "reversible",
      reversibilityReason: "view change",
      observation: observation(),
      verification: { status: "passed", checks: [{ passed: true, detail: "changed", predicate: "pageDelta" }] },
    };

    const good = toWireActionResult(base);
    assert.equal(good.ok, true);
    assert.equal(good.why, undefined, "a working action needs no explanation");
    assert.equal(good.recovery, undefined);

    const bad = toWireActionResult({
      ...base,
      ok: false,
      verification: {
        status: "failed",
        checks: [{ passed: false, detail: "nothing changed", predicate: "pageDelta" }],
      },
      failure: {
        recovery: "noop click",
        changes: [],
        consoleErrors: ["boom"],
        failedRequests: [],
      },
    });
    assert.deepEqual(bad.why, ["pageDelta: nothing changed"]);
    assert.equal(bad.recovery, "noop click");
    assert.deepEqual(bad.consoleErrors, ["boom"]);
  });

  it("serialises without indentation, because indentation is billed", () => {
    const text = wireText(toWireObservation(observation()));
    assert.equal(text.includes("\n"), false);
    assert.equal(text.includes("  "), false);
  });

  it("is materially smaller than the raw observation", () => {
    const controls = Array.from({ length: 30 }, (_, index) =>
      control({ ref: `e${index}`, name: `Field ${index}`, value: "" }),
    );
    const raw = JSON.stringify(observation({ controls }), null, 2);
    const wire = wireText(toWireObservation(observation({ controls })));
    assert.ok(
      wire.length < raw.length / 2,
      `expected a large saving, got ${wire.length} vs ${raw.length}`,
    );
  });
});
