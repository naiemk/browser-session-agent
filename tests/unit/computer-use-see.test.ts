import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation } from "../../src/core/types.ts";
import { FakeWindowPort } from "../../src/core/window-port.ts";
import { nullEvidence } from "../../src/runtime/evidence.ts";
import { TOOL_OBSERVE, TOOL_SEE, TOOL_USE } from "../../src/runtime/names.ts";
import { buildTools } from "../../src/runtime/tools.ts";

const page: Observation = {
  id: "obs_1",
  tabId: "tab_1",
  url: "https://example.test/list",
  title: "List",
  controls: [{ ref: "e1", role: "link", name: "Ada", tag: "a" }],
  dialogs: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  changes: [],
};

function textOf(result: { content: Array<{ type?: string; text?: string }> }): string {
  return result.content
    .filter((part) => part.type === "text" || part.text)
    .map((part) => part.text ?? "")
    .join("");
}

describe("see and use", () => {
  it("focuses a window, returns that see, and the next observe still has refs", async () => {
    const desktop = new FakeWindowPort([
      { id: "chrome", app: "Google Chrome", title: "List", focused: true },
      { id: "notes", app: "Notes", title: "Shopping", focused: false },
    ]);
    let leftBrowser = 0;
    const tools = buildTools({
      browser: {
        async observe() {
          return page;
        },
      } as BrowserPort,
      evidence: nullEvidence(),
      window: desktop,
      onLeaveBrowser: async () => {
        leftBrowser += 1;
      },
    });
    const use = tools.find((tool) => (tool as { name: string }).name === TOOL_USE) as {
      execute: (id: string, params: unknown) => Promise<{
        content: Array<{ type?: string; text?: string; data?: string; mimeType?: string }>;
      }>;
    };
    const observe = tools.find((tool) => (tool as { name: string }).name === TOOL_OBSERVE) as {
      execute: (id: string, params: unknown) => Promise<{ content: Array<{ type?: string; text?: string }> }>;
    };

    const seen = await use.execute("t1", { action: "focus", title: "Shopping" });
    const body = textOf(seen);
    assert.match(body, /Shopping/);
    assert.match(body, /Notes/);
    assert.equal(leftBrowser, 1);
    const image = seen.content.find((part) => part.type === "image");
    assert.equal(image?.mimeType, "image/png");
    assert.equal(Buffer.from(image?.data ?? "", "base64").toString(), "png:notes");

    const after = await observe.execute("t2", {});
    assert.match(textOf(after), /e1/);
    assert.match(textOf(after), /Ada/);
    assert.equal(tools.some((tool) => (tool as { name: string }).name === TOOL_SEE), true);
  });

  it("does not attach an image when two windows share the title", async () => {
    const desktop = new FakeWindowPort([
      { id: "a", app: "Notes", title: "Shopping", focused: true },
      { id: "b", app: "TextEdit", title: "Shopping", focused: false },
    ]);
    const tools = buildTools({
      browser: { async observe() { return page; } } as BrowserPort,
      evidence: nullEvidence(),
      window: desktop,
    });
    const use = tools.find((tool) => (tool as { name: string }).name === TOOL_USE) as {
      execute: (id: string, params: unknown) => Promise<{ content: Array<{ type?: string; text?: string }> }>;
    };
    const result = await use.execute("t1", { action: "focus", title: "Shopping" });
    assert.match(textOf(result), /Pick one/);
    assert.equal(result.content.some((part) => part.type === "image"), false);
  });

  it("omits see and use when there is no desktop port", () => {
    const tools = buildTools({
      browser: {} as BrowserPort,
      evidence: nullEvidence(),
    });
    const names = tools.map((tool) => (tool as { name: string }).name);
    assert.equal(names.includes(TOOL_SEE), false);
    assert.equal(names.includes(TOOL_USE), false);
  });
});
