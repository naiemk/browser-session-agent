import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { evaluateTask } from "../../src/core/evaluator.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { TaskStore } from "../../src/core/task.ts";
import type { Observation, PageFacts } from "../../src/core/types.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "evaluator-"));
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

async function setup(goalId: string) {
  const store = await TaskStore.open(root, goalId);
  const ledger = await Ledger.open(root, goalId);
  const task = await store.create({
    objective: "Apply for the role",
    criteria: [{ kind: "text_visible", text: "Thanks Ada" }],
  });
  return { store, ledger, taskId: task.taskId };
}

describe("independent evaluator", () => {
  it("returns success with distilled facts when the criteria hold", async () => {
    const { store, ledger, taskId } = await setup("g1");
    await ledger.append({
      type: "action",
      action: { kind: "click", ref: "e4" },
      after: { url: "http://fixture.test/done", title: "Done", changes: [] },
      outcome: { ok: true },
    });
    await ledger.append({
      type: "approval",
      action: { kind: "click", ref: "e4" },
      outcome: { ok: true, detail: "auto-approved" },
    });
    await ledger.append({ type: "probe", intent: "form inventory" });

    const evaluation = await evaluateTask({
      store,
      taskId,
      ledger,
      browser: stubBrowser("Thanks Ada"),
      claim: "submitted",
    });

    assert.equal(evaluation.status, "success");
    if (evaluation.status !== "success") return;
    const keys = evaluation.newKnowledge.map((fact) => fact.key);
    assert.ok(keys.includes("finalUrl"));
    assert.ok(keys.includes("committedActions"));
    assert.ok(keys.includes("probesUsed"));
  });

  it("asks for user input when a question went unanswered", async () => {
    const { store, ledger, taskId } = await setup("g2");
    await ledger.append({ type: "action", action: { kind: "click" }, outcome: { ok: true } });
    await ledger.append({
      type: "note",
      intent: "asked: what is your work authorization status",
      outcome: { ok: false, detail: "unanswered" },
    });

    const evaluation = await evaluateTask({ store, taskId, ledger, browser: stubBrowser("Apply") });
    assert.equal(evaluation.status, "needs_user_input");
    if (evaluation.status !== "needs_user_input") return;
    assert.match(evaluation.missingInputs[0] ?? "", /work authorization/);
  });

  it("asks for user input when the gate parked an action", async () => {
    const { store, ledger, taskId } = await setup("g3");
    await ledger.append({ type: "action", action: { kind: "type" }, outcome: { ok: true } });
    await ledger.append({
      type: "parked",
      outcome: { ok: false, detail: "waiting for approval: submits a form" },
    });

    const evaluation = await evaluateTask({ store, taskId, ledger, browser: stubBrowser("Apply") });
    assert.equal(evaluation.status, "needs_user_input");
  });

  it("calls for a replan when the same action keeps failing", async () => {
    const { store, ledger, taskId } = await setup("g4");
    for (let attempt = 0; attempt < 3; attempt++) {
      await ledger.append({
        type: "failure",
        action: { kind: "click", ref: "e7" },
        outcome: { ok: false, detail: "noop click: nothing on the page changed" },
      });
    }

    const evaluation = await evaluateTask({ store, taskId, ledger, browser: stubBrowser("Apply") });
    assert.equal(evaluation.status, "replan");
    if (evaluation.status !== "replan") return;
    assert.match(evaluation.reason, /3 attempts at the same action/);
  });

  it("asks for context when the agent could not find a control", async () => {
    const { store, ledger, taskId } = await setup("g5");
    await ledger.append({
      type: "failure",
      action: { kind: "click", ref: "e9" },
      outcome: { ok: false, detail: "missing_ref: no control with ref e9" },
    });

    const evaluation = await evaluateTask({ store, taskId, ledger, browser: stubBrowser("Apply") });
    assert.equal(evaluation.status, "needs_more_context");
    if (evaluation.status !== "needs_more_context") return;
    assert.match(evaluation.missingContext[0] ?? "", /missing_ref/);
  });

  it("asks for context when nothing was attempted at all", async () => {
    const { store, ledger, taskId } = await setup("g6");
    const evaluation = await evaluateTask({ store, taskId, ledger, browser: stubBrowser("Apply") });
    assert.equal(evaluation.status, "needs_more_context");
    if (evaluation.status !== "needs_more_context") return;
    assert.match(evaluation.missingContext[0] ?? "", /took no action/);
  });

  it("treats a provider failure as fatal rather than blaming the agent", async () => {
    const { store, ledger, taskId } = await setup("g7");
    const evaluation = await evaluateTask({
      store,
      taskId,
      ledger,
      browser: stubBrowser("Apply"),
      sessionError: "402 This request requires more credits",
    });
    assert.equal(evaluation.status, "fatal");
  });

  it("retries when turns ran out", async () => {
    const { store, ledger, taskId } = await setup("g8");
    await ledger.append({ type: "action", action: { kind: "type" }, outcome: { ok: true } });
    const evaluation = await evaluateTask({
      store,
      taskId,
      ledger,
      browser: stubBrowser("Apply"),
      capped: true,
    });
    assert.equal(evaluation.status, "retry");
    if (evaluation.status !== "retry") return;
    assert.match(evaluation.reason, /ran out of turns/);
  });

  it("retries on an ordinary single failure", async () => {
    const { store, ledger, taskId } = await setup("g9");
    await ledger.append({
      type: "failure",
      action: { kind: "click", ref: "e2" },
      outcome: { ok: false, detail: "expected \"Thanks\", read \"\"" },
    });
    const evaluation = await evaluateTask({ store, taskId, ledger, browser: stubBrowser("Apply") });
    assert.equal(evaluation.status, "retry");
  });

  it("ignores what the executor claimed", async () => {
    const { store, ledger, taskId } = await setup("g10");
    await ledger.append({ type: "action", action: { kind: "click" }, outcome: { ok: true } });
    const evaluation = await evaluateTask({
      store,
      taskId,
      ledger,
      browser: stubBrowser("Apply"),
      claim: "success: I submitted the application and saw the confirmation",
    });
    assert.notEqual(evaluation.status, "success");
  });
});
