import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { validatePredicate } from "../../src/core/predicates.ts";
import type { Observation, PageFacts } from "../../src/core/types.ts";
import { runSuite } from "../../src/suite/runner.ts";
import { SUITE_TASKS } from "../../src/suite/tasks.ts";
import type { AgentDriver, DriverContext, SuiteTask } from "../../src/suite/types.ts";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://fixture.test/apply",
    title: "Apply",
    controls: [{ ref: "e1", role: "button", name: "Submit application", tag: "button" }],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** A browser port with no browser, so runner behaviour is testable in isolation. */
function stubBrowser(text = "Thanks Ada Lovelace"): BrowserPort {
  const obs = observation();
  const facts: PageFacts = { url: obs.url, title: obs.title, text, observation: obs };
  return {
    openTab: async () => "tab_1",
    pageFor: () => {
      throw new Error("stub has no page");
    },
    observe: async () => obs,
    facts: async () => facts,
    lastObservation: () => obs,
    screenshot: async () => undefined,
    consoleErrors: () => [],
    failedRequests: () => [],
    close: async () => undefined,
  };
}

function task(overrides: Partial<SuiteTask> = {}): SuiteTask {
  return {
    id: "t1",
    goal: "do the thing",
    path: "/apply",
    criteria: [{ kind: "text_visible", text: "Thanks Ada Lovelace" }],
    maxSteps: 3,
    tags: [],
    reference: [],
    ...overrides,
  };
}

const idleDriver: AgentDriver = { name: "idle", runTask: async () => ({ claimed: "did nothing" }) };

function steppingDriver(steps: number): AgentDriver {
  return {
    name: "stepping",
    runTask: async (context: DriverContext) => {
      for (let i = 0; i < steps; i++) context.step();
      return { claimed: `${steps} steps`, tokens: 100, costUsd: 0.002 };
    },
  };
}

describe("AGENT-01-T01 suite runner", () => {
  it("passes a task whose criteria hold", async () => {
    const report = await runSuite({
      tasks: [task()],
      driver: idleDriver,
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });
    assert.equal(report.runs[0]?.outcome, "passed");
    assert.equal(report.successRate, 1);
    assert.equal(report.passed, 1);
  });

  it("fails a task whose criteria do not hold, and says why", async () => {
    const report = await runSuite({
      tasks: [task({ criteria: [{ kind: "text_visible", text: "never appears" }] })],
      driver: idleDriver,
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });
    const run = report.runs[0]!;
    assert.equal(run.outcome, "failed");
    assert.match(run.detail, /never appears/);
    assert.equal(run.checks.some((check) => !check.passed), true);
  });

  it("reports cap exhaustion as a distinct outcome from failure", async () => {
    const report = await runSuite({
      tasks: [task({ maxSteps: 2, criteria: [{ kind: "text_visible", text: "never appears" }] })],
      driver: steppingDriver(5),
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });
    const run = report.runs[0]!;
    assert.equal(run.outcome, "capped", "a runaway task is capped, not merely failed");
    assert.equal(run.steps, 3, "stepping stops at the cap boundary");
    assert.match(run.detail, /step cap exceeded/);
  });

  it("never lets the driver decide the verdict", async () => {
    const liar: AgentDriver = {
      name: "liar",
      runTask: async () => ({ claimed: "I definitely completed the application" }),
    };
    const report = await runSuite({
      tasks: [task({ criteria: [{ kind: "text_visible", text: "never appears" }] })],
      driver: liar,
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });
    assert.equal(report.runs[0]?.outcome, "failed", "a claim of success is not evidence");
  });

  it("evaluates the criteria it was given, even if the driver edits its copy", async () => {
    const saboteur: AgentDriver = {
      name: "saboteur",
      runTask: async (context) => {
        try {
          // Both of these must be powerless: the runner snapshots criteria first.
          (context.task.criteria as unknown as unknown[]).length = 0;
          (context.task as { criteria: unknown }).criteria = [];
        } catch {
          // frozen, which is also fine
        }
        return { claimed: "criteria cleared" };
      },
    };
    const report = await runSuite({
      tasks: [task({ criteria: [{ kind: "text_visible", text: "never appears" }] })],
      driver: saboteur,
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });
    assert.equal(report.runs[0]?.outcome, "failed");
    assert.equal(report.runs[0]?.checks.length, 1, "the original criterion was still evaluated");
  });

  it("aggregates the three headline metrics", async () => {
    const report = await runSuite({
      tasks: [task({ id: "a" }), task({ id: "b", criteria: [{ kind: "text_visible", text: "nope" }] })],
      driver: steppingDriver(2),
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });
    assert.equal(report.taskCount, 2);
    assert.equal(report.passed, 1);
    assert.equal(report.successRate, 0.5);
    assert.equal(report.stepsPerTask, 2);
    assert.equal(report.tokensPerTask, 100);
    assert.equal(report.costPerTask, 0.002);
    assert.ok(report.startedAt && report.finishedAt && report.target === "stepping");
  });

  it("runs only the selected ids", async () => {
    const report = await runSuite({
      tasks: [task({ id: "a" }), task({ id: "b" })],
      driver: idleDriver,
      origin: "http://fixture.test",
      browser: stubBrowser(),
      only: ["b"],
    });
    assert.deepEqual(report.runs.map((run) => run.id), ["b"]);
  });
});

describe("AGENT-01-T01 suite definitions", () => {
  it("loads without a browser and is big enough to measure", () => {
    assert.ok(SUITE_TASKS.length >= 20, `expected at least 20 tasks, got ${SUITE_TASKS.length}`);
  });

  it("has unique ids, external criteria, and a reference solution", () => {
    const ids = new Set<string>();
    for (const entry of SUITE_TASKS) {
      assert.equal(ids.has(entry.id), false, `duplicate task id ${entry.id}`);
      ids.add(entry.id);
      assert.ok(entry.goal.length > 10, `${entry.id}: goal must read like a user request`);
      assert.ok(entry.criteria.length > 0, `${entry.id}: needs external criteria`);
      assert.ok(entry.maxSteps > 0, `${entry.id}: needs a step cap`);
      assert.ok(entry.reference.length > 0, `${entry.id}: needs a reference solution`);
      assert.ok(entry.tags.length > 0, `${entry.id}: needs at least one tag`);
    }
  });

  it("has well-formed criteria", () => {
    for (const entry of SUITE_TASKS) {
      for (const criterion of entry.criteria) {
        assert.deepEqual(
          validatePredicate(criterion),
          [],
          `${entry.id}: ${JSON.stringify(criterion)}`,
        );
      }
    }
  });

  it("covers the failure modes worth measuring", () => {
    const tags = new Set(SUITE_TASKS.flatMap((entry) => entry.tags));
    for (const required of [
      "validation",
      "combobox",
      "upload",
      "pagination",
      "ambiguous",
      "abandon",
      "commit",
      "errors",
      "template",
    ]) {
      assert.ok(tags.has(required), `suite is missing coverage for "${required}"`);
    }
  });
});
