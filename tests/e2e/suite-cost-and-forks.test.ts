import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createMockModel, type PlanStep } from "../../src/runtime/mock-model.ts";
import { TOOL_ACT, TOOL_FORK, TOOL_PEEK } from "../../src/runtime/names.ts";
import { planForTask } from "../../src/suite/mock-plan.ts";
import { runSuite } from "../../src/suite/runner.ts";
import { RuntimeDriver } from "../../src/suite/runtime-driver.ts";
import { taskById } from "../../src/suite/tasks.ts";
import type { SuiteTask } from "../../src/suite/types.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * Can the scoreboard see the two failures we set out to fix?
 *
 * Everything else in this build is worthless if not. Before this, both failures were
 * invisible: an agent that spent its whole budget walking a list the expensive way and an
 * agent that silently picked one meaning of an ambiguous word both produced runs the suite
 * scored the same as a good one.
 */

const server = new FixtureServer();
let origin = "";
let root = "";

before(async () => {
  origin = await server.start();
  root = await mkdtemp(path.join(os.tmpdir(), "suite-cost-"));
});

after(async () => {
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

/** Run one task against a fixed plan, the way the mock target does. */
async function runWith(task: SuiteTask, plan: (task: SuiteTask, origin: string) => PlanStep[]) {
  const report = await runSuite({
    tasks: [task],
    origin,
    evidenceRoot: await mkdtemp(path.join(root, "run-")),
    driver: new RuntimeDriver({
      name: "test",
      root,
      createStream: (forTask, forOrigin) =>
        createMockModel({ plan: plan(forTask as SuiteTask, forOrigin) }),
      policy: "auto",
    }),
  });
  return report.runs[0]!;
}

const ROSTER = ["ada", "grace", "alan", "katherine", "barbara", "edsger", "dana"];

describe("the expensive route runs out of budget", () => {
  const task = taskById("roster-cheap-traversal")!;

  it("cannot finish by navigating to each person and back", async () => {
    // The route the real run took: open a profile, go back to the list, open the next.
    // The roster rebuilds its rows on load, so coming back also costs the paging.
    const expensive = (_task: SuiteTask, at: string): PlanStep[] => [
      ...ROSTER.flatMap((handle) => [
        { tool: TOOL_ACT, args: { kind: "navigate", url: `${at}/p/${handle}` } },
        { tool: TOOL_ACT, args: { kind: "navigate", url: `${at}/roster` } },
      ]),
      { tool: TOOL_ACT, args: { kind: "navigate", url: `${at}/p/dana` } },
      { tool: TOOL_ACT, target: "Mark this one", args: { kind: "click" } },
    ];

    const run = await runWith(task, expensive);

    // It runs out of budget before reaching Dana. The turn cap is what stops it rather
    // than the step cap, because the driver gives each task as many turns as steps and
    // every action costs at least one turn; either way the budget is gone.
    assert.notEqual(run.outcome, "passed", run.detail);
    assert.match(run.detail, /capped after \d+ turns/);
    assert.ok(
      run.checks.some((check) => !check.passed),
      "and the person was never marked",
    );
  });

  it("finishes comfortably by peeking, with no change to the task", async () => {
    // Same task, same criteria, same cap. Only the route differs.
    const run = await runWith(task, planForTask);

    assert.equal(run.outcome, "passed", run.detail);
    assert.ok(
      run.steps <= task.maxSteps,
      `${run.steps} steps against a cap of ${task.maxSteps}`,
    );
  });
});

describe("silently resolving an ambiguous word fails the task", () => {
  const task = taskById("roster-ambiguous-referent")!;

  it("fails when the agent picks one meaning and says nothing", async () => {
    // This is the run we actually got: it does the work, lands on a valid page, and never
    // mentions that "contacts" could have meant the other list.
    const silent = (_task: SuiteTask, at: string): PlanStep[] => [
      {
        tool: TOOL_PEEK,
        args: { url: `${at}/p/dana`, expect: { kind: "text_visible", text: "Minsk" } },
      },
      { tool: TOOL_ACT, args: { kind: "navigate", url: `${at}/p/dana` } },
    ];

    const run = await runWith(task, silent);

    assert.equal(run.outcome, "failed");
    assert.ok(
      run.checks.every((check) => check.passed),
      "the page criteria pass, which is exactly why the page could not catch this",
    );
    const evidence = run.evidenceChecks ?? [];
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]?.passed, false);
    assert.match(evidence[0]?.detail ?? "", /resolved silently/);
  });

  it("passes when the agent surfaces the fork first", async () => {
    const surfaced = (forTask: SuiteTask, at: string): PlanStep[] => planForTask(forTask, at);

    const run = await runWith(task, surfaced);

    assert.equal(run.outcome, "passed", run.detail);
    assert.equal(run.evidenceChecks?.[0]?.passed, true);
  });

  it("is not satisfied by a fork with only one candidate", async () => {
    const thin = (_task: SuiteTask, at: string): PlanStep[] => [
      {
        tool: TOOL_FORK,
        args: {
          term: "contacts",
          candidates: ["Roster"],
          resolution: "chose",
          why: "only looked at one",
        },
      },
      { tool: TOOL_ACT, args: { kind: "navigate", url: `${at}/p/dana` } },
    ];

    const run = await runWith(task, thin);

    assert.equal(run.outcome, "failed");
    // The tool refuses a one-sided fork, so nothing is recorded and the check still fails.
    assert.equal(run.evidenceChecks?.[0]?.passed, false);
  });
});
