import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation, PageFacts } from "../../src/core/types.ts";
import { createMockModel, latestObservation } from "../../src/runtime/mock-model.ts";
import { TOOL_ACT, TOOL_CHECK, TOOL_DONE, TOOL_OBSERVE } from "../../src/runtime/names.ts";
import { runTask } from "../../src/runtime/runtime.ts";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://fixture.test/apply",
    title: "Apply",
    controls: [
      { ref: "e1", role: "text", name: "Full name", tag: "input" },
      { ref: "e2", role: "submit", name: "Submit application", tag: "button", submits: true },
    ],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

interface Recorder {
  browser: BrowserPort;
  acted: Array<{ kind: string; ref?: string; text?: string }>;
}

function recordingBrowser(text = "Application"): Recorder {
  const acted: Recorder["acted"] = [];
  const obs = observation();
  const facts: PageFacts = { url: obs.url, title: obs.title, text, observation: obs };
  return {
    acted,
    browser: {
      openTab: async () => "tab_1",
      openIsolatedTab: async () => {
        throw new Error("stub has no isolated context");
      },
      closeTab: async () => undefined,
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
    },
  };
}

const CARD = {
  objective: "Apply as Ada Lovelace",
  criteria: [{ kind: "text_visible" as const, text: "Thanks" }],
};

describe("mock model drives Pi's real loop", () => {
  it("runs a plan as real tool calls and finishes with a report", async () => {
    const seen: string[][] = [];
    const { browser } = recordingBrowser();

    const outcome = await runTask({
      card: CARD,
      tools: { browser, tabId: "tab_1", policy: "auto" },
      stream: createMockModel({
        plan: [
          { tool: TOOL_OBSERVE },
          { tool: TOOL_CHECK, args: { predicate: { kind: "text_visible", text: "Application" } } },
        ],
        onTurn: (info) => seen.push(info.calls),
      }),
    });

    assert.deepEqual(seen, [[TOOL_OBSERVE], [TOOL_CHECK], [TOOL_DONE]]);
    assert.equal(outcome.report?.status, "success");
    assert.equal(outcome.error, undefined);
    assert.deepEqual(outcome.modelErrors, []);
    assert.ok(outcome.turns >= 3, `expected several turns, got ${outcome.turns}`);
  });

  it("resolves a named target to a ref from the newest observation", async () => {
    const { browser } = recordingBrowser();
    const calls: string[][] = [];

    await runTask({
      card: CARD,
      tools: { browser, tabId: "tab_1", policy: "auto" },
      stream: createMockModel({
        // No explicit observe: the plan needs a snapshot first and must fetch one.
        plan: [{ tool: TOOL_ACT, target: "Full name", args: { kind: "type", text: "Ada" } }],
        onTurn: (info) => calls.push(info.calls),
      }),
    });

    assert.deepEqual(calls[0], [TOOL_OBSERVE], "a named target forces a look first");
    assert.deepEqual(calls[1], [TOOL_ACT]);
  });

  it("reports a missing target instead of inventing a ref", async () => {
    const { browser } = recordingBrowser();
    const outcome = await runTask({
      card: CARD,
      tools: { browser, tabId: "tab_1" },
      stream: createMockModel({
        plan: [
          { tool: TOOL_OBSERVE },
          { tool: TOOL_ACT, target: "Nonexistent field", args: { kind: "type", text: "x" } },
        ],
      }),
    });
    assert.equal(outcome.report?.status, "failed");
    assert.match(outcome.report?.summary ?? "", /could not find a control named/);
  });

  it("plays a raw script, including a model that lies about success", async () => {
    const { browser } = recordingBrowser();
    const outcome = await runTask({
      card: CARD,
      tools: { browser, tabId: "tab_1" },
      stream: createMockModel({
        script: [
          {
            text: "I will just say it worked.",
            calls: [{ name: TOOL_DONE, arguments: { status: "success", summary: "all done" } }],
          },
        ],
      }),
    });

    assert.equal(outcome.report?.status, "success", "the report is recorded as given");
    assert.equal(outcome.turns, 1, "no browser action was taken");
  });

  it("surfaces a provider failure as a model error rather than a throw", async () => {
    const { browser } = recordingBrowser();
    const outcome = await runTask({
      card: CARD,
      tools: { browser, tabId: "tab_1" },
      stream: createMockModel({ script: [{ error: "402 out of credits" }] }),
    });

    assert.deepEqual(outcome.modelErrors, ["402 out of credits"]);
    assert.equal(outcome.report, undefined);
  });

  it("caps a runaway agent and says it was capped", async () => {
    const { browser } = recordingBrowser();
    const outcome = await runTask({
      card: CARD,
      tools: { browser, tabId: "tab_1" },
      maxTurns: 3,
      // A model that never finishes: observe forever.
      stream: createMockModel({
        script: Array.from({ length: 50 }, () => ({
          calls: [{ name: TOOL_OBSERVE, arguments: {} }],
        })),
      }),
    });

    assert.equal(outcome.capped, true);
    assert.ok(outcome.turns <= 5, `expected the cap to stop it, got ${outcome.turns} turns`);
    assert.equal(outcome.report, undefined, "a capped run files no report");
  });

  it("accounts tokens and cost without a provider", async () => {
    const { browser } = recordingBrowser();
    const outcome = await runTask({
      card: CARD,
      tools: { browser, tabId: "tab_1" },
      stream: createMockModel({
        plan: [{ tool: TOOL_OBSERVE }],
        usagePerTurn: { tokens: 100, costUsd: 0.001 },
      }),
    });

    assert.ok(outcome.tokens >= 200, `expected accumulated tokens, got ${outcome.tokens}`);
    assert.ok(outcome.costUsd > 0);
  });
});

describe("latestObservation", () => {
  it("finds the newest observation in a transcript", () => {
    const context = {
      systemPrompt: "",
      messages: [
        { role: "toolResult", content: [{ type: "text", text: '{"url":"a","controls":[]}' }] },
        { role: "assistant", content: [] },
        {
          role: "toolResult",
          content: [{ type: "text", text: '{"url":"b","controls":[{"ref":"e1"}]}' }],
        },
      ],
    } as never;
    assert.equal(latestObservation(context)?.url, "b");
  });

  it("looks inside an action result for its observation", () => {
    const context = {
      systemPrompt: "",
      messages: [
        {
          role: "toolResult",
          content: [{ type: "text", text: '{"ok":true,"observation":{"url":"c","controls":[]}}' }],
        },
      ],
    } as never;
    assert.equal(latestObservation(context)?.url, "c");
  });

  it("returns nothing when there is no observation yet", () => {
    assert.equal(latestObservation({ systemPrompt: "", messages: [] } as never), undefined);
  });
});
