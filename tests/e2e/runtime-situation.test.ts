import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { evaluateTask } from "../../src/core/evaluator.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { GoalStore } from "../../src/core/state.ts";
import { TaskStore } from "../../src/core/task.ts";
import { createMockModel } from "../../src/runtime/mock-model.ts";
import {
  TOOL_DONE,
  TOOL_OBSERVE,
  TOOL_REMEMBER,
  TOOL_STRANGER,
} from "../../src/runtime/names.ts";
import { runTask, runTaskWithDeclineRetry } from "../../src/runtime/runtime.ts";
import { DEFAULT_STRANGER_VIEW_BUDGET } from "../../src/runtime/tools.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "situation-"));
});

after(async () => {
  await browser?.close();
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

const CRITERIA = [{ kind: "control_exists" as const, name: "Full name" }];

describe("establishing the situation through the tools", () => {
  it("lets the agent see a page as a stranger and record what it worked out", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const ledger = await Ledger.open(root, "g_situate");
    const goalStore = await GoalStore.open(root, "g_situate", "work out where I stand");

    const outcome = await runTask({
      card: { objective: "Work out whether this page needs a login", criteria: CRITERIA },
      stream: createMockModel({
        plan: [
          { tool: TOOL_OBSERVE },
          { tool: TOOL_STRANGER, args: {} },
          {
            tool: TOOL_REMEMBER,
            args: {
              key: "apply-page-visibility",
              value: "the signed-out view of /apply rendered the same form, so no session is needed",
            },
          },
        ],
      }),
      tools: { browser, tabId: tab, ledger, goalStore },
    });

    assert.equal(outcome.report?.status, "success");
    assert.ok(outcome.toolCalls >= 3);

    // The fact survives the task, and points at the evidence that established it.
    const facts = (await goalStore.goal()).facts as Record<
      string,
      { value: string; evidence?: string }
    >;
    const fact = facts["apply-page-visibility"];
    assert.ok(fact, JSON.stringify(facts));
    assert.match(fact.value, /no session is needed/);
    assert.ok(fact.evidence, "a fact must carry the event that established it");

    const events = await ledger.read();
    assert.ok(
      events.some((event) => event.id === fact.evidence),
      "the evidence id must resolve to a real ledger event",
    );
    assert.ok(
      events.some((event) => event.type === "probe" && /without a session/.test(event.intent ?? "")),
      "the stranger view is recorded too",
    );
  });

  it("budgets session-free views, because each one is a real anonymous request", async () => {
    const tab = await browser.openTab(`${origin}/apply`);

    await runTask({
      card: { objective: "Look repeatedly", criteria: CRITERIA },
      maxTurns: 12,
      stream: createMockModel({
        plan: Array.from({ length: DEFAULT_STRANGER_VIEW_BUDGET + 2 }, () => ({
          tool: TOOL_STRANGER,
          args: {},
        })),
      }),
      tools: {
        browser,
        tabId: tab,
        strangerViewBudget: DEFAULT_STRANGER_VIEW_BUDGET,
        ledger: await Ledger.open(root, "g_budget"),
      },
    });

    const events = await Ledger.readFrom(root, "g_budget");
    const views = events.filter((event) => event.type === "probe").length;
    assert.equal(
      views,
      DEFAULT_STRANGER_VIEW_BUDGET,
      `expected the budget to cap views at ${DEFAULT_STRANGER_VIEW_BUDGET}, saw ${views}`,
    );
  });

  it("refuses to remember nothing", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const goalStore = await GoalStore.open(root, "g_empty");

    await runTask({
      card: { objective: "Record an empty fact", criteria: CRITERIA },
      stream: createMockModel({
        plan: [{ tool: TOOL_REMEMBER, args: { key: "", value: "" } }],
      }),
      tools: { browser, tabId: tab, goalStore },
    });

    assert.deepEqual((await goalStore.goal()).facts, {});
  });
});

describe("a model that declines", () => {
  const DECLINE = "Sorry, I can't help with that.";

  function decliningModel(times: number) {
    const script = Array.from({ length: times }, () => ({ text: DECLINE }));
    return createMockModel({ script });
  }

  it("is reported as declined rather than as nothing happening", async () => {
    const tab = await browser.openTab(`${origin}/apply`);

    const outcome = await runTask({
      card: { objective: "Do the thing", criteria: CRITERIA },
      stream: decliningModel(1),
      tools: { browser, tabId: tab },
    });

    assert.equal(outcome.toolCalls, 0);
    assert.equal(outcome.report, undefined);
    assert.equal(outcome.declined, DECLINE);
    assert.deepEqual(outcome.modelErrors, [], "a refusal is not a transport failure");
  });

  it("is not confused with a model error", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const outcome = await runTask({
      card: { objective: "Do the thing", criteria: CRITERIA },
      stream: createMockModel({ script: [{ error: "402 out of credits" }] }),
      tools: { browser, tabId: tab },
    });

    assert.equal(outcome.declined, undefined, "the error is the story, not a refusal");
    assert.deepEqual(outcome.modelErrors, ["402 out of credits"]);
  });

  it("is not raised when the agent actually worked", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const outcome = await runTask({
      card: { objective: "Look at the page", criteria: CRITERIA },
      stream: createMockModel({ plan: [{ tool: TOOL_OBSERVE }] }),
      tools: { browser, tabId: tab },
    });
    assert.equal(outcome.declined, undefined);
    assert.ok(outcome.toolCalls > 0);
  });

  it("gets exactly one retry, with the established facts attached", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const cards: string[] = [];

    // Declines the first time; with the facts in hand, does the work. Each attempt gets one
    // model instance, so its plan advances across turns the way a real one would.
    const declines = createMockModel({ script: [{ text: DECLINE }] });
    const works = createMockModel({ plan: [{ tool: TOOL_OBSERVE }] });
    let retrying = false;

    const stream = ((model, context, options) => {
      cards.push(String((context as { systemPrompt?: string }).systemPrompt ?? ""));
      return (retrying ? works : declines)(model, context, options);
    }) as Parameters<typeof runTask>[0]["stream"];

    const result = await runTaskWithDeclineRetry({
      card: { objective: "Do the thing", criteria: CRITERIA },
      stream,
      tools: { browser, tabId: tab },
      factsOnRetry: async () => {
        retrying = true;
        return { "operating-identity": "signed in as ada, observed in the account menu" };
      },
    });

    assert.equal(result.attempts, 2);
    assert.equal(result.firstDecline, DECLINE);
    assert.equal(result.outcome.declined, undefined, "the retry did the work");
    assert.equal(result.outcome.report?.status, "success");

    assert.doesNotMatch(cards[0]!, /operating-identity/, "the first attempt knew nothing");
    assert.match(
      cards.at(-1)!,
      /operating-identity/,
      "the retry carries what was established",
    );
  });

  it("stops after one retry when the answer does not change", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    let calls = 0;
    const stream = ((model, context, options) => {
      calls += 1;
      return createMockModel({ script: [{ text: DECLINE }] })(model, context, options);
    }) as Parameters<typeof runTask>[0]["stream"];

    const result = await runTaskWithDeclineRetry({
      card: { objective: "Do the thing", criteria: CRITERIA },
      stream,
      tools: { browser, tabId: tab },
      factsOnRetry: async () => ({ "operating-identity": "signed in as ada" }),
    });

    assert.equal(result.attempts, 2);
    assert.equal(result.outcome.declined, DECLINE);
    assert.equal(calls, 2, "one retry, not a rephrasing loop until the model agrees");
  });

  it("does not retry when there is nothing new to say", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    let calls = 0;
    const stream = ((model, context, options) => {
      calls += 1;
      return createMockModel({ script: [{ text: DECLINE }] })(model, context, options);
    }) as Parameters<typeof runTask>[0]["stream"];

    const result = await runTaskWithDeclineRetry({
      card: { objective: "Do the thing", criteria: CRITERIA },
      stream,
      tools: { browser, tabId: tab },
      factsOnRetry: async () => ({}),
    });

    assert.equal(result.attempts, 1);
    assert.equal(calls, 1, "no facts, no point asking again");
  });

  it("becomes a decision for the human, not a silent failure", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const ledger = await Ledger.open(root, "g_declined");
    const store = await TaskStore.open(root, "g_declined");
    const task = await store.create({
      objective: "Do the thing",
      criteria: [{ kind: "text_visible", text: "never appears" }],
    });

    const evaluation = await evaluateTask({
      store,
      taskId: task.taskId,
      browser,
      ledger,
      tabId: tab,
      declined: DECLINE,
    });

    assert.equal(evaluation.status, "needs_user_input");
    if (evaluation.status !== "needs_user_input") return;
    assert.match(evaluation.missingInputs[0] ?? "", /declined and took no action/);
    assert.match(evaluation.missingInputs[0] ?? "", /can't help with that/);
  });
});
