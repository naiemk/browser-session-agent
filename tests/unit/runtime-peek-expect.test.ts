import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation } from "../../src/core/types.ts";
import { TOOL_PEEK } from "../../src/runtime/names.ts";
import { buildTools } from "../../src/runtime/tools.ts";
import { nullEvidence } from "../../src/runtime/evidence.ts";

function observation(url: string): Observation {
  return {
    id: "obs_1",
    tabId: "tab_1",
    url,
    title: "Roster",
    controls: [],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };
}

function peekBrowser(url: string): BrowserPort {
  const obs = observation(url);
  return {
    observe: async () => obs,
    facts: async () => ({ url, title: obs.title, text: "Hello", observation: obs }),
    openTab: async () => "side",
    closeTab: async () => undefined,
    lastObservation: () => obs,
  } as BrowserPort;
}

function peekTool(browser: BrowserPort) {
  const tools = buildTools({ browser, tabId: "tab_1", evidence: nullEvidence() });
  return tools.find((tool) => (tool as { name: string }).name === TOOL_PEEK) as {
    execute: (id: string, params: unknown) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
  };
}

describe("peek expect at the tool boundary", () => {
  it("drops a malformed expect rather than evaluating url includes \"undefined\"", async () => {
    const tool = peekTool(peekBrowser("https://example.test/p/dana"));
    const result = await tool.execute("t1", {
      url: "https://example.test/p/dana",
      expect: { kind: "url_includes" },
    });
    const text = result.content.map((part) => part.text).join("");
    assert.doesNotMatch(text, /undefined/);
    const details = result.details as { identity?: string; matched?: boolean };
    assert.equal("identity" in details, false);
    assert.equal(details.matched, true);
  });

  it("still checks a well-formed expect", async () => {
    const tool = peekTool(peekBrowser("https://example.test/p/grace"));
    const result = await tool.execute("t1", {
      url: "https://example.test/p/grace",
      expect: { kind: "url_includes", text: "/p/grace" },
    });
    const details = result.details as { identity?: string; matched?: boolean };
    assert.equal(details.matched, true);
    assert.match(details.identity ?? "", /url includes "\/p\/grace"/);
  });
});
