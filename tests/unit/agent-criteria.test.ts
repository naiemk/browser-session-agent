import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { resolveTaskOutcome, stepCheck, TaskStore } from "../../src/core/task.ts";
import { CoreError, type Observation, type PageFacts } from "../../src/core/types.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "criteria-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function stubBrowser(text: string): BrowserPort {
  const observation: Observation = {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://fixture.test/apply",
    title: "Apply",
    controls: [{ ref: "e1", role: "submit", name: "Submit application", tag: "button" }],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };
  const facts: PageFacts = { url: observation.url, title: observation.title, text, observation };
  return {
    openTab: async () => "tab_1",
    openIsolatedTab: async () => {
      throw new Error("stub has no isolated context");
    },
    closeTab: async () => undefined,
    pageFor: () => {
      throw new Error("stub has no page");
    },
    observe: async () => observation,
    facts: async () => facts,
    lastObservation: () => observation,
    screenshot: async () => undefined,
    consoleErrors: () => [],
    failedRequests: () => [],
    close: async () => undefined,
  };
}

describe("AGENT-03-T01 task criteria", () => {
  it("evaluates criteria in code, with no model in the path", async () => {
    const store = await TaskStore.open(root, "goal_1");
    const task = await store.create({
      objective: "submit the application",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
    });

    const passing = await resolveTaskOutcome(store, task.taskId, stubBrowser("Thanks Ada"));
    assert.equal(passing.outcome.status, "success");
    assert.equal(passing.verification.status, "passed");
  });

  it("refuses success when the criteria are false, whatever the executor claims", async () => {
    const store = await TaskStore.open(root, "goal_2");
    const task = await store.create({
      objective: "submit the application",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
    });

    const resolution = await resolveTaskOutcome(store, task.taskId, stubBrowser("Application"), {
      claim: "I definitely submitted the application successfully",
    });

    assert.equal(resolution.outcome.status, "failed");
    assert.match(
      resolution.outcome.status === "failed" ? resolution.outcome.reason : "",
      /text visible "Thanks Ada"/,
    );
    assert.equal((await store.require(task.taskId)).status, "failed");
  });

  it("cannot be weakened by mutating the record the creator was handed", async () => {
    const store = await TaskStore.open(root, "goal_3");
    const task = await store.create({
      objective: "submit the application",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
    });

    // A caller with a reference to the returned record tries to relax the bar.
    task.criteria.length = 0;
    task.criteria.push({ kind: "text_visible", text: "Apply" });

    const resolution = await resolveTaskOutcome(store, task.taskId, stubBrowser("Apply"));
    assert.equal(resolution.outcome.status, "failed", "criteria are re-read from disk");
    assert.equal(resolution.verification.checks[0]?.predicate, 'text visible "Thanks Ada"');
  });

  it("hands out frozen criteria for display", async () => {
    const store = await TaskStore.open(root, "goal_4");
    const task = await store.create({
      objective: "submit",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
    });
    const criteria = await store.criteriaFor(task.taskId);
    assert.equal(Object.isFrozen(criteria), true);
    assert.equal(Object.isFrozen(criteria[0]), true);
  });

  it("judges a resumed task by the same standard in a fresh store", async () => {
    const first = await TaskStore.open(root, "goal_5");
    const task = await first.create({
      objective: "submit the application",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
      maxTurns: 12,
    });

    const reopened = await TaskStore.open(root, "goal_5");
    const record = await reopened.require(task.taskId);
    assert.deepEqual(record.criteria, [{ kind: "text_visible", text: "Thanks Ada" }]);
    assert.equal(record.maxTurns, 12);

    const resolution = await resolveTaskOutcome(reopened, task.taskId, stubBrowser("Thanks Ada"));
    assert.equal(resolution.outcome.status, "success");
  });

  it("reports a capped task differently from a failed one", async () => {
    const store = await TaskStore.open(root, "goal_6");
    const task = await store.create({
      objective: "submit",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
      maxTurns: 5,
    });
    const resolution = await resolveTaskOutcome(store, task.taskId, stubBrowser("Apply"), {
      capped: true,
    });
    assert.equal(resolution.outcome.status, "capped");
  });

  it("rejects a task with no criteria, and an unusable criterion at authoring time", async () => {
    const store = await TaskStore.open(root, "goal_7");
    await assert.rejects(
      () => store.create({ objective: "vibes", criteria: [] }),
      (err: unknown) => err instanceof CoreError && err.code === "bad_task",
    );
    await assert.rejects(() =>
      store.create({
        objective: "bad criterion",
        criteria: [{ kind: "definitely_not_a_predicate" } as never],
      }),
    );
  });

  it("records the claim next to the verdict so they can be compared later", async () => {
    const store = await TaskStore.open(root, "goal_8");
    const ledger = await Ledger.open(root, "goal_8");
    const task = await store.create({
      objective: "submit the application",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
    });
    await resolveTaskOutcome(store, task.taskId, stubBrowser("Apply"), {
      claim: "submitted it",
      ledger,
    });

    const [event] = await ledger.read();
    assert.equal(event?.type, "task_finished");
    assert.equal(event?.outcome?.ok, false);
    assert.equal((event?.payload as { claim: string }).claim, "submitted it");
  });
});

describe("AGENT-03-T02 agent-authored step checks", () => {
  it("runs a valid predicate and records it as evidence", async () => {
    const ledger = await Ledger.open(root, "goal_step");
    const verification = await stepCheck(
      stubBrowser("Thanks Ada"),
      { kind: "text_visible", text: "Thanks Ada" },
      { ledger, intent: "did the confirmation appear" },
    );
    assert.equal(verification.status, "passed");

    const [event] = await ledger.read();
    assert.equal(event?.type, "check");
    assert.equal(event?.intent, "did the confirmation appear");
  });

  it("rejects unknown kinds and script-shaped input", async () => {
    for (const bad of [
      { kind: "run_script", code: "fetch('/x')" },
      { kind: "text_visible", text: "x", script: "alert(1)" },
      { kind: "all", of: [] },
      "text_visible",
    ]) {
      await assert.rejects(() => stepCheck(stubBrowser("x"), bad));
    }
  });

  it("cannot make a task successful when the given criteria fail", async () => {
    const store = await TaskStore.open(root, "goal_9");
    const browser = stubBrowser("Apply");
    const task = await store.create({
      objective: "submit the application",
      criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
    });

    // The agent proves something true but irrelevant, several times over.
    for (const predicate of [
      { kind: "text_visible", text: "Apply" },
      { kind: "control_exists", name: "Submit application" },
      { kind: "no_console_error" },
    ]) {
      const passed = await stepCheck(browser, predicate);
      assert.equal(passed.status, "passed");
    }

    const resolution = await resolveTaskOutcome(store, task.taskId, browser, {
      claim: "all my checks passed",
    });
    assert.equal(resolution.outcome.status, "failed", "step checks are additive, never authoritative");
  });
});
