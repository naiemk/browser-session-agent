import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PlanStore } from "../../src/core/plan.ts";
import { CoreError } from "../../src/core/types.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "plan-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const CRITERIA = [{ kind: "text_visible" as const, text: "done" }];

describe("living task graph", () => {
  it("only offers a task whose dependencies are done", async () => {
    const plan = await PlanStore.open(root, "g1", "reach email companies");
    const first = await plan.addTask({ objective: "find companies", criteria: CRITERIA });
    const second = await plan.addTask({
      objective: "contact them",
      criteria: CRITERIA,
      dependencies: [first.id],
    });

    assert.equal((await plan.nextReadyTask())?.id, first.id);

    await plan.markRunning(first.id);
    assert.equal((await plan.nextReadyTask())?.id, undefined, "a running task is not offered again");

    await plan.markDone(first.id);
    assert.equal((await plan.nextReadyTask())?.id, second.id);
  });

  it("withholds a task whose prerequisites are unknown, then releases it", async () => {
    const plan = await PlanStore.open(root, "g2");
    const task = await plan.addTask({
      objective: "apply with a CV",
      criteria: CRITERIA,
      prerequisites: ["cv"],
    });

    assert.equal(await plan.nextReadyTask(), undefined);

    await plan.block(task.id, ["cv"]);
    assert.deepEqual((await plan.read()).missingInputs, ["cv"]);

    await plan.provideInputs({ cv: "/tmp/cv.pdf" });
    const ready = await plan.nextReadyTask();
    assert.equal(ready?.id, task.id, "supplying the input unblocks the task");
    assert.deepEqual((await plan.read()).missingInputs, []);
  });

  it("grows at runtime when a task discovers more work", async () => {
    const plan = await PlanStore.open(root, "g3");
    const search = await plan.addTask({
      objective: "search for candidates",
      criteria: CRITERIA,
      approach: "linkedin",
    });

    const discovered = await plan.discover(
      search.id,
      ["Acme", "Globex", "Initech"].map((company) => ({
        objective: `contact ${company}`,
        criteria: CRITERIA,
      })),
    );

    assert.equal(discovered.length, 3);
    assert.equal((await plan.summary()).total, 4);
    for (const task of discovered) {
      assert.equal(task.parentId, search.id);
      assert.equal(task.approach, "linkedin", "discovered work inherits the approach");
    }
  });

  it("does not let discovered work starve the original plan", async () => {
    const plan = await PlanStore.open(root, "g4");
    const first = await plan.addTask({ objective: "original", criteria: CRITERIA });
    const second = await plan.addTask({ objective: "also original", criteria: CRITERIA });
    await plan.markDone(first.id);
    await plan.discover(first.id, [{ objective: "discovered", criteria: CRITERIA }]);

    assert.equal((await plan.nextReadyTask())?.id, second.id, "oldest pending first");
  });

  it("substitutes an approach and records why", async () => {
    const plan = await PlanStore.open(root, "g5");
    const a = await plan.addTask({ objective: "search on the network", criteria: CRITERIA, approach: "linkedin" });
    const b = await plan.addTask({ objective: "filter results", criteria: CRITERIA, approach: "linkedin" });
    await plan.markDone(a.id);

    await plan.replaceApproach({
      reason: "the network blocks search for this account",
      abandon: "linkedin",
      adopt: {
        approach: "web-search",
        tasks: [{ objective: "search the web for companies", criteria: CRITERIA }],
      },
    });

    const record = await plan.read();
    assert.equal(record.tasks.find((task) => task.id === a.id)?.status, "done", "finished work stands");
    assert.equal(record.tasks.find((task) => task.id === b.id)?.status, "abandoned");
    assert.equal(record.revisions.length, 1);
    assert.match(record.revisions[0]!.reason, /blocks search/);

    const next = await plan.nextReadyTask();
    assert.equal(next?.approach, "web-search");
  });

  it("counts attempts so repeated failure is visible", async () => {
    const plan = await PlanStore.open(root, "g6");
    const task = await plan.addTask({ objective: "submit", criteria: CRITERIA });
    await plan.markRunning(task.id);
    await plan.markFailed(task.id, "noop click");
    await plan.updateTask(task.id, { status: "pending" });
    await plan.markRunning(task.id);

    assert.equal((await plan.requireTask(task.id)).attempts, 2);
  });

  it("is complete only when every task is done or abandoned", async () => {
    const plan = await PlanStore.open(root, "g7");
    assert.equal(await plan.isComplete(), false, "an empty plan is not a finished plan");

    const a = await plan.addTask({ objective: "one", criteria: CRITERIA });
    const b = await plan.addTask({ objective: "two", criteria: CRITERIA });
    await plan.markDone(a.id);
    assert.equal(await plan.isComplete(), false);

    await plan.updateTask(b.id, { status: "abandoned" });
    assert.equal(await plan.isComplete(), true);
  });

  it("survives a fresh process with no session", async () => {
    const first = await PlanStore.open(root, "g8", "apply to roles");
    const task = await first.addTask({ objective: "apply", criteria: CRITERIA, approach: "direct" });
    await first.provideInputs({ cv: "/tmp/cv.pdf" });

    const reopened = await PlanStore.open(root, "g8");
    const record = await reopened.read();
    assert.equal(record.goal, "apply to roles");
    assert.equal(record.facts.cv, "/tmp/cv.pdf");
    assert.equal((await reopened.requireTask(task.id)).approach, "direct");
  });

  it("refuses a task with no criteria", async () => {
    const plan = await PlanStore.open(root, "g9");
    await assert.rejects(
      () => plan.addTask({ objective: "vibes", criteria: [] }),
      (err: unknown) => err instanceof CoreError && err.code === "bad_task",
    );
  });

  it("summarises the graph for a status view", async () => {
    const plan = await PlanStore.open(root, "g10");
    const a = await plan.addTask({ objective: "a", criteria: CRITERIA });
    await plan.addTask({ objective: "b", criteria: CRITERIA });
    await plan.markDone(a.id);
    const summary = await plan.summary();
    assert.equal(summary.total, 2);
    assert.equal(summary.byStatus.done, 1);
    assert.equal(summary.byStatus.pending, 1);
  });
});
