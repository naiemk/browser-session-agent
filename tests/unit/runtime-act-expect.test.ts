import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation } from "../../src/core/types.ts";
import { TOOL_ACT, TOOL_CHECK } from "../../src/runtime/names.ts";
import { buildTools } from "../../src/runtime/tools.ts";
import { nullEvidence } from "../../src/runtime/evidence.ts";

function observation(url: string): Observation {
  return {
    id: "obs_1",
    tabId: "tab_1",
    url,
    title: "Page",
    controls: [],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };
}

function actBrowser(start: string): BrowserPort {
  let url = start;
  const obs = () => observation(url);
  return {
    observe: async () => obs(),
    facts: async () => ({ url, title: obs().title, text: "Hello", observation: obs() }),
    navigate: async (_tab, next) => {
      url = next;
    },
    waitFor: async () => undefined,
    lastObservation: () => obs(),
  } as BrowserPort;
}

function toolNamed(browser: BrowserPort, name: string) {
  const tools = buildTools({ browser, tabId: "tab_1", evidence: nullEvidence() });
  return tools.find((tool) => (tool as { name: string }).name === name) as {
    execute: (id: string, params: unknown) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
  };
}

describe("act expect at the tool boundary", () => {
  it("drops a malformed navigate expect rather than evaluating url includes \"undefined\"", async () => {
    const tool = toolNamed(actBrowser("https://example.test/start"), TOOL_ACT);
    const result = await tool.execute("t1", {
      kind: "navigate",
      url: "https://example.test/jobs",
      expect: { kind: "url_includes" },
    });
    const text = result.content.map((part) => part.text).join("");
    assert.doesNotMatch(text, /undefined/);
    const details = result.details as { ok?: boolean; recovery?: string };
    assert.equal(details.ok, true);
    assert.doesNotMatch(details.recovery ?? "", /undefined/);
  });

  it("does not throw on an unknown or empty expect", async () => {
    const tool = toolNamed(actBrowser("https://example.test/start"), TOOL_ACT);
    const changed = await tool.execute("t1", {
      kind: "navigate",
      url: "https://example.test/jobs",
      expect: { kind: "changed" },
    });
    assert.equal((changed.details as { ok?: boolean }).ok, true);

    const empty = await tool.execute("t2", {
      kind: "navigate",
      url: "https://example.test/jobs",
      expect: {},
    });
    assert.equal((empty.details as { ok?: boolean }).ok, true);
    assert.doesNotMatch(JSON.stringify(empty.details), /Cannot read properties of undefined/);
  });
});

describe("check at the tool boundary", () => {
  it("errors on a malformed predicate rather than evaluating it", async () => {
    const tool = toolNamed(actBrowser("https://example.test/jobs"), TOOL_CHECK);
    const result = await tool.execute("t1", { predicate: { kind: "url_includes" } });
    const details = result.details as { error?: string };
    assert.match(details.error ?? "", /needs a string "text"|unknown|missing/);
    assert.doesNotMatch(JSON.stringify(result.details), /"undefined"/);
  });
});
