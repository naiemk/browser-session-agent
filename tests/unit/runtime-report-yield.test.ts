import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation } from "../../src/core/types.ts";
import { nullEvidence } from "../../src/runtime/evidence.ts";
import { TOOL_DONE, TOOL_SIDE_OPEN } from "../../src/runtime/names.ts";
import { buildTools } from "../../src/runtime/tools.ts";

function observation(url: string, tabId: string): Observation {
  return {
    id: "obs_1",
    tabId,
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

describe("report yields", () => {
  it("calls onReport, terminates, and closes an open side tab", async () => {
    const closed: string[] = [];
    let reports = 0;
    const page = (tabId?: string): Observation => ({
      ...observation("https://example.test/list", tabId ?? "primary"),
      controls: [{ ref: "e1", role: "link", name: "Home", tag: "a" }],
    });
    const browser = {
      observe: async (tabId?: string) => page(tabId),
      facts: async (tabId?: string) => {
        const obs = page(tabId);
        return { url: obs.url, title: obs.title, text: "Home", observation: obs };
      },
      openTab: async () => "side-1",
      closeTab: async (tabId: string) => {
        closed.push(tabId);
      },
    } as BrowserPort;

    const tools = buildTools({
      browser,
      tabId: "primary",
      evidence: nullEvidence(),
      onReport: () => {
        reports += 1;
      },
    });
    const byName = (name: string) =>
      tools.find((tool) => (tool as { name: string }).name === name) as {
        execute: (
          id: string,
          params: unknown,
        ) => Promise<{ terminate?: boolean; details: unknown }>;
      };

    await byName(TOOL_SIDE_OPEN).execute("t1", { url: "https://example.test/other" });
    const result = await byName(TOOL_DONE).execute("t2", { status: "success", summary: "done" });

    assert.equal(reports, 1);
    assert.equal(result.terminate, true);
    assert.deepEqual(closed, ["side-1"]);
  });
});
