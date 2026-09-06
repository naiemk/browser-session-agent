import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation } from "../../src/core/types.ts";
import { TOOL_SIDE_OPEN } from "../../src/runtime/names.ts";
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

describe("side tab open of a data document", () => {
  it("errors, closes the tab, and does not keep a working side tab", async () => {
    const closed: string[] = [];
    const html = observation("https://example.test/roster");
    const json = observation("https://example.test/api/search");
    const browser = {
      observe: async (tab?: string) => (tab === "side" ? json : html),
      facts: async (tab?: string) =>
        tab === "side"
          ? {
              url: json.url,
              title: json.title,
              text: '{"users":[{"name":"User 12"}]}',
              observation: json,
              document: { kind: "data" as const, contentType: "application/json", bytes: 40 },
            }
          : {
              url: html.url,
              title: html.title,
              text: "Roster",
              observation: html,
              document: { kind: "html" as const, contentType: "text/html", bytes: 12 },
            },
      openTab: async () => "side",
      closeTab: async (id: string) => {
        closed.push(id);
      },
      lastObservation: () => html,
    } as BrowserPort;

    const tools = buildTools({ browser, tabId: "tab_1", evidence: nullEvidence() });
    const tool = tools.find((candidate) => (candidate as { name: string }).name === TOOL_SIDE_OPEN) as {
      execute: (id: string, params: unknown) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
    };

    const opened = await tool.execute("t1", { url: "https://example.test/api/search" });
    const details = opened.details as { error?: string; stillOn?: string };
    assert.match(details.error ?? "", /not a page/);
    assert.match(details.error ?? "", /json/i);
    assert.doesNotMatch(JSON.stringify(opened.details), /User 12/);
    assert.deepEqual(closed, ["side"]);
    assert.match(details.stillOn ?? "", /\/roster$/);
  });
});
