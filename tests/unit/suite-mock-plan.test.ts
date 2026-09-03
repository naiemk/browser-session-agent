import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { observationSatisfies, planForTask } from "../../src/suite/mock-plan.ts";
import { SUITE_TASKS, taskById } from "../../src/suite/tasks.ts";
import { TOOL_ACT } from "../../src/runtime/names.ts";
import type { WireObservation } from "../../src/runtime/wire.ts";

const OBSERVATION: WireObservation = {
  url: "http://fixture.test/list",
  title: "Catalogue",
  controls: [
    { ref: "e1", role: "button", name: "Next page" },
    { ref: "e2", role: "option", name: "United States" },
    { ref: "e3", role: "text", name: "Email", value: "ada@example.com" },
  ],
  dialogs: [],
};

describe("mock plan translation", () => {
  it("turns every reference step into an act call", () => {
    const task = taskById("apply-submit")!;
    const plan = planForTask(task, "http://fixture.test");
    assert.equal(plan.length, task.reference.length);
    assert.ok(plan.every((step) => step.tool === TOOL_ACT));
    assert.deepEqual(
      plan.map((step) => (step.args as { kind: string }).kind),
      ["type", "type", "click"],
    );
    assert.deepEqual(plan.map((step) => step.target), ["Full name", "Email", "Submit application"]);
  });

  it("resolves a relative navigate against the fixture origin", () => {
    const plan = planForTask(
      {
        ...taskById("apply-submit")!,
        reference: [{ do: "navigate", url: "/apply" }],
      },
      "http://fixture.test",
    );
    assert.equal((plan[0]!.args as { url: string }).url, "http://fixture.test/apply");
  });

  it("converts an until condition into a repeat-while loop", () => {
    const plan = planForTask(taskById("pagination-find-item")!, "http://fixture.test");
    const paging = plan[0]!;
    assert.ok(paging.repeatWhile, "paging must repeat");
    assert.equal(paging.maxRepeat, 8);

    // Item 42 is not on this page, so keep paging.
    assert.equal(paging.repeatWhile!(OBSERVATION), true);
    // Once it appears, stop.
    assert.equal(
      paging.repeatWhile!({
        ...OBSERVATION,
        controls: [...OBSERVATION.controls, { ref: "e9", role: "button", name: "Item 42" }],
      }),
      false,
    );
  });

  it("builds a plan for every task in the suite", () => {
    for (const task of SUITE_TASKS) {
      const plan = planForTask(task, "http://fixture.test");
      assert.equal(plan.length, task.reference.length, task.id);
    }
  });
});

describe("snapshot-only predicate evaluation", () => {
  it("answers control, url, title, and value questions", () => {
    assert.equal(observationSatisfies({ kind: "control_exists", name: "Next page" }, OBSERVATION), true);
    assert.equal(observationSatisfies({ kind: "control_exists", name: "Nope" }, OBSERVATION), false);
    assert.equal(observationSatisfies({ kind: "control_absent", name: "Nope" }, OBSERVATION), true);
    assert.equal(observationSatisfies({ kind: "url_includes", text: "/list" }, OBSERVATION), true);
    assert.equal(observationSatisfies({ kind: "title_includes", text: "catalogue" }, OBSERVATION), true);
    assert.equal(observationSatisfies({ kind: "ref_exists", ref: "e2" }, OBSERVATION), true);
    assert.equal(
      observationSatisfies({ kind: "value_includes", name: "Email", text: "ada" }, OBSERVATION),
      true,
    );
  });

  it("respects role when matching a control", () => {
    assert.equal(
      observationSatisfies({ kind: "control_exists", role: "option", name: "United States" }, OBSERVATION),
      true,
    );
    assert.equal(
      observationSatisfies({ kind: "control_exists", role: "combobox", name: "United States" }, OBSERVATION),
      false,
    );
  });

  it("combines predicates", () => {
    assert.equal(
      observationSatisfies(
        {
          kind: "all",
          of: [
            { kind: "control_exists", name: "Next page" },
            { kind: "not", of: { kind: "control_exists", name: "Item 42" } },
          ],
        },
        OBSERVATION,
      ),
      true,
    );
  });

  it("throws rather than guessing when a predicate needs page text", () => {
    assert.throws(
      () => observationSatisfies({ kind: "text_visible", text: "anything" }, OBSERVATION),
      /cannot evaluate "text_visible" from a snapshot alone/,
    );
  });
});
