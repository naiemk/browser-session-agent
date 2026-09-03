import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation, PageFacts } from "../../src/core/types.ts";
import { infrastructureFailure } from "../../src/suite/runtime-driver.ts";
import { formatReport, runSuite } from "../../src/suite/runner.ts";
import type { AgentDriver, SuiteTask } from "../../src/suite/types.ts";

function stubBrowser(text = "nothing here"): BrowserPort {
  const observation: Observation = {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://fixture.test/apply",
    title: "Apply",
    controls: [],
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

function task(id: string): SuiteTask {
  return {
    id,
    goal: "do the thing that matters",
    path: "/apply",
    criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
    maxSteps: 5,
    tags: ["test"],
    reference: [{ do: "click", name: "Submit" }],
  };
}

const brokenProvider: AgentDriver = {
  name: "broken",
  runTask: async () => ({
    claimed: "session error: 402 out of credits",
    infraError: "402 out of credits",
  }),
};

const workingButWrong: AgentDriver = {
  name: "wrong",
  runTask: async () => ({ claimed: "I finished it" }),
};

describe("AGENT-01 suite validity", () => {
  it("classifies provider failures as infrastructure, not agent failure", () => {
    for (const message of [
      "402 This request requires more credits",
      "429 Too Many Requests",
      "503 upstream unavailable",
      "rate limit exceeded",
      "insufficient quota",
      "provider overloaded",
    ]) {
      assert.ok(infrastructureFailure(message), message);
    }
  });

  it("does not mistake an agent mistake for infrastructure", () => {
    for (const message of [
      "missing_ref: no control with ref e9",
      "the model refused to answer",
      "probe_rejected: probes read, they never act",
      undefined,
    ]) {
      assert.equal(infrastructureFailure(message), undefined, String(message));
    }
  });

  it("finds the failure among several model errors", () => {
    assert.equal(
      infrastructureFailure(undefined, ["something odd", "429 slow down", "another"]),
      "429 slow down",
    );
  });

  it("excludes lost runs from the success rate instead of scoring them zero", async () => {
    const report = await runSuite({
      tasks: [task("a"), task("b")],
      driver: brokenProvider,
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });

    assert.equal(report.errored, 2);
    assert.equal(report.scored, 0);
    assert.equal(report.passed, 0);
    assert.equal(report.valid, false, "a run this broken is not a result");
    assert.match(formatReport(report), /INVALID/);
    assert.match(report.runs[0]!.detail, /^infrastructure:/);
  });

  it("still scores a run the agent genuinely failed", async () => {
    const report = await runSuite({
      tasks: [task("a")],
      driver: workingButWrong,
      origin: "http://fixture.test",
      browser: stubBrowser(),
    });
    assert.equal(report.errored, 0);
    assert.equal(report.scored, 1);
    assert.equal(report.valid, true);
    assert.equal(report.runs[0]!.outcome, "failed");
  });

  it("stays valid when only a small share of runs is lost", async () => {
    let calls = 0;
    const flaky: AgentDriver = {
      name: "flaky",
      runTask: async () => {
        calls += 1;
        return calls === 1
          ? { claimed: "429", infraError: "429 slow down" }
          : { claimed: "tried" };
      },
    };
    const report = await runSuite({
      tasks: [task("a"), task("b"), task("c"), task("d"), task("e"), task("f"), task("g"), task("h")],
      driver: flaky,
      origin: "http://fixture.test",
      browser: stubBrowser("Thanks Ada"),
    });
    assert.equal(report.errored, 1);
    assert.equal(report.scored, 7);
    assert.equal(report.passed, 7);
    assert.equal(report.valid, true);
    assert.equal(report.successRate, 1, "the rate is over runs that actually happened");
  });
});
