import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, parseCriterion } from "../../src/cli/main.ts";
import { SMOKE_TASK_IDS, selectTasks } from "../../src/suite/tags.ts";
import { SUITE_TASKS } from "../../src/suite/tasks.ts";

describe("CLI argument parsing", () => {
  it("separates the command, positionals, and flags", () => {
    const args = parseArgs(["run", "apply for the role", "--url", "http://x/apply", "--headed"]);
    assert.equal(args.command, "run");
    assert.deepEqual(args.positional, ["apply for the role"]);
    assert.equal(args.flags.url, "http://x/apply");
    assert.equal(args.flags.headed, true);
  });

  it("collects a repeated flag instead of dropping the earlier one", () => {
    const args = parseArgs([
      "run",
      "goal",
      "--criterion",
      "text_visible:Thanks",
      "--criterion",
      "url_includes:/done",
    ]);
    assert.equal(args.flags.criterion, "text_visible:Thanks,url_includes:/done");
  });

  it("treats a trailing flag as a boolean", () => {
    assert.equal(parseArgs(["suite", "--target", "mock", "--all"]).flags.all, true);
  });

  it("defaults to help with no arguments", () => {
    assert.equal(parseArgs([]).command, "help");
  });
});

describe("criterion shorthand", () => {
  it("treats bare text as visible text", () => {
    assert.deepEqual(parseCriterion("Application submitted"), {
      kind: "text_visible",
      text: "Application submitted",
    });
  });

  it("understands kind:value", () => {
    assert.deepEqual(parseCriterion("url_includes:/jobs"), {
      kind: "url_includes",
      text: "/jobs",
    });
    assert.deepEqual(parseCriterion("text_absent:error"), {
      kind: "text_absent",
      text: "error",
    });
  });

  it("understands a named field for value predicates", () => {
    assert.deepEqual(parseCriterion("value_includes:Email=ada@example.com"), {
      kind: "value_includes",
      name: "Email",
      text: "ada@example.com",
    });
  });

  it("understands control predicates", () => {
    assert.deepEqual(parseCriterion("control_exists:Submit application"), {
      kind: "control_exists",
      name: "Submit application",
    });
  });

  it("accepts raw JSON for the full language", () => {
    assert.deepEqual(
      parseCriterion('{"kind":"all","of":[{"kind":"text_visible","text":"a"}]}'),
      { kind: "all", of: [{ kind: "text_visible", text: "a" }] },
    );
  });

  it("rejects an unusable criterion loudly", () => {
    assert.throws(() => parseCriterion('{"kind":"not_a_predicate"}'));
  });
});

describe("task selection", () => {
  it("selects the smoke subset, and it is genuinely smaller", () => {
    const smoke = selectTasks(SUITE_TASKS, { smoke: true });
    assert.equal(smoke.length, SMOKE_TASK_IDS.length);
    assert.ok(smoke.length < SUITE_TASKS.length / 2, "a live run should be cheap");
  });

  it("covers distinct failure modes in the smoke subset", () => {
    const tags = new Set(selectTasks(SUITE_TASKS, { smoke: true }).flatMap((task) => task.tags));
    for (const required of ["form", "commit", "widget", "abandon", "validation", "errors"]) {
      assert.ok(tags.has(required), `smoke subset is missing "${required}"`);
    }
  });

  it("filters by tag and by id", () => {
    assert.ok(selectTasks(SUITE_TASKS, { tags: ["combobox"] }).every((task) => task.tags.includes("combobox")));
    assert.deepEqual(
      selectTasks(SUITE_TASKS, { only: ["apply-submit"] }).map((task) => task.id),
      ["apply-submit"],
    );
  });

  it("returns everything by default", () => {
    assert.equal(selectTasks(SUITE_TASKS).length, SUITE_TASKS.length);
  });

  it("names only tasks that exist", () => {
    const ids = new Set(SUITE_TASKS.map((task) => task.id));
    for (const id of SMOKE_TASK_IDS) {
      assert.ok(ids.has(id), `smoke list names a task that does not exist: ${id}`);
    }
  });
});
