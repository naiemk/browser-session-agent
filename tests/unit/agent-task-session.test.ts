import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation, PageFacts } from "../../src/core/types.ts";
import { buildTaskCard } from "../../src/agent/task-card.ts";
import { runBoundedTask, type CreateSessionOptions } from "../../src/agent/task-session.ts";
import {
  TOOL_ACT,
  TOOL_ASK,
  TOOL_CHECK,
  TOOL_OBSERVE,
  TOOL_PROBE,
  TOOL_TASK_RESULT,
} from "../../src/agent/tool-names.ts";

function stubBrowser(): BrowserPort {
  const observation: Observation = {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://fixture.test/apply",
    title: "Apply",
    controls: [{ ref: "e1", role: "text", name: "Full name", tag: "input" }],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };
  const facts: PageFacts = { url: observation.url, title: observation.title, text: "Application", observation };
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

const CARD = {
  objective: "Apply for the Staff Engineer role as Ada Lovelace",
  criteria: [{ kind: "text_visible" as const, text: "Application submitted" }],
  startUrl: "http://fixture.test/apply",
};

describe("AGENT-07-T01 bounded task session", () => {
  it("builds a session with only the browser tools and the card as system prompt", async () => {
    let captured: CreateSessionOptions | undefined;
    let disposed = 0;

    await runBoundedTask({
      card: CARD,
      tools: { browser: stubBrowser(), tabId: "tab_1" },
      maxTurns: 9,
      createSession: async (options) => {
        captured = options;
        return {
          prompt: async () => undefined,
          dispose: () => {
            disposed += 1;
          },
        };
      },
    });

    assert.ok(captured);
    assert.deepEqual(captured.toolNames.sort(), [
      TOOL_ACT,
      TOOL_ASK,
      TOOL_CHECK,
      TOOL_OBSERVE,
      TOOL_PROBE,
      TOOL_TASK_RESULT,
    ].sort());
    assert.equal(captured.maxTurns, 9);
    assert.match(captured.systemPrompt, /Apply for the Staff Engineer role/);
    assert.match(captured.systemPrompt, /text visible "Application submitted"/);
    assert.equal(disposed, 1, "the session is disposed so nothing leaks into the next task");
  });

  it("registers pruning and the turn cap, and can switch them off", async () => {
    const events: string[] = [];
    const capture = async (options: CreateSessionOptions) => {
      options.register({ on: (event: string) => events.push(event) });
      return { prompt: async () => undefined, dispose: () => undefined };
    };

    await runBoundedTask({
      card: CARD,
      tools: { browser: stubBrowser() },
      createSession: capture,
    });
    assert.deepEqual(events.sort(), ["context", "turn_end"]);

    events.length = 0;
    await runBoundedTask({
      card: CARD,
      tools: { browser: stubBrowser() },
      createSession: capture,
      prune: { enabled: false },
      turnCapEnabled: false,
    });
    assert.deepEqual(events, [], "both are optional so the suite can measure their effect");
  });

  it("surfaces the agent's report, and terminates the turn when it is filed", async () => {
    const result = await runBoundedTask({
      card: CARD,
      tools: { browser: stubBrowser() },
      createSession: async (options) => ({
        prompt: async () => {
          const tool = options.tools.find((entry) => entry.name === TOOL_TASK_RESULT)!;
          const outcome = await tool.execute("call_1", {
            status: "success",
            summary: "submitted the application",
            evidence: "confirmation text",
          });
          assert.equal(outcome.terminate, true, "the report ends the task");
          assert.deepEqual(outcome.details, {
            status: "success",
            summary: "submitted the application",
            evidence: "confirmation text",
          });
        },
        dispose: () => undefined,
      }),
    });

    assert.equal(result.report?.status, "success");
    assert.equal(result.report?.summary, "submitted the application");
  });

  it("coerces an invented status rather than trusting it", async () => {
    const result = await runBoundedTask({
      card: CARD,
      tools: { browser: stubBrowser() },
      createSession: async (options) => ({
        prompt: async () => {
          const tool = options.tools.find((entry) => entry.name === TOOL_TASK_RESULT)!;
          await tool.execute("call_1", { status: "totally_fine", summary: "trust me" });
        },
        dispose: () => undefined,
      }),
    });
    assert.equal(result.report?.status, "failed");
  });

  it("reports a session error without losing the turn count", async () => {
    const result = await runBoundedTask({
      card: CARD,
      tools: { browser: stubBrowser() },
      maxTurns: 4,
      createSession: async () => ({
        prompt: async () => {
          throw new Error("model unavailable");
        },
        dispose: () => undefined,
      }),
    });
    assert.equal(result.error, "model unavailable");
    assert.equal(result.turns.limit, 4);
  });

  it("passes usage through for cost accounting", async () => {
    const result = await runBoundedTask({
      card: CARD,
      tools: { browser: stubBrowser() },
      createSession: async () => ({
        prompt: async () => undefined,
        dispose: () => undefined,
        usage: () => ({ tokens: 4321, costUsd: 0.0123 }),
      }),
    });
    assert.equal(result.tokens, 4321);
    assert.equal(result.costUsd, 0.0123);
  });
});

describe("AGENT-07-T01 task card", () => {
  it("states the objective, the criteria, and that claims are not evidence", () => {
    const card = buildTaskCard(CARD);
    assert.match(card, /Apply for the Staff Engineer role/);
    assert.match(card, /text visible "Application submitted"/);
    assert.match(card, /Claiming\s+success does not make a task successful/);
  });

  it("is not a coding agent", () => {
    const card = buildTaskCard(CARD);
    assert.match(card, /not a coding assistant/);
    assert.match(card, /no files, no shell, and no repository/);
    assert.doesNotMatch(card, /working directory/i);
  });

  it("tells the agent what it may commit under each policy", () => {
    assert.match(buildTaskCard({ ...CARD, policy: "never" }), /are forbidden on this task/);
    assert.match(buildTaskCard({ ...CARD, policy: "ask" }), /need operator approval/);
    assert.match(buildTaskCard({ ...CARD, policy: "auto" }), /permitted once their preconditions hold/);
  });

  it("includes known facts so they are not rediscovered", () => {
    const card = buildTaskCard({ ...CARD, knownFacts: { fullName: "Ada Lovelace" } });
    assert.match(card, /What you already know/);
    assert.match(card, /Ada Lovelace/);
  });
});
