import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { loadCheckpoint, saveCheckpoint } from "../../src/core/checkpoint.ts";
import type { Control, Observation, PageFacts } from "../../src/core/types.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "checkpoint-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function stubBrowser(controls: Control[]): BrowserPort {
  const observation: Observation = {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://fixture.test/apply?step=2",
    title: "Apply",
    controls,
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: [],
    capturedAt: new Date().toISOString(),
  };
  const facts: PageFacts = { url: observation.url, title: observation.title, text: "", observation };
  return {
    openTab: async () => "tab_1",
    openIsolatedTab: async () => {
      throw new Error("stub has no isolated context");
    },
    closeTab: async () => undefined,
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

describe("AGENT-05-T02 navigation checkpoints", () => {
  it("captures the url and everything entered so far", async () => {
    const browser = stubBrowser([
      { ref: "e1", role: "text", name: "Full name", tag: "input", value: "Ada Lovelace" },
      { ref: "e2", role: "email", name: "Email", tag: "input", value: "ada@example.com" },
      { ref: "e3", role: "select-one", name: "Location", tag: "select", value: "nyc" },
      { ref: "e4", role: "text", name: "Empty field", tag: "input" },
      { ref: "e5", role: "submit", name: "Submit application", tag: "button" },
    ]);

    const checkpoint = await saveCheckpoint(browser, { root, goalId: "goal_1", tag: "before-nav" });

    assert.equal(checkpoint.url, "http://fixture.test/apply?step=2");
    assert.deepEqual(checkpoint.values, {
      "Full name": "Ada Lovelace",
      Email: "ada@example.com",
      Location: "nyc",
    });
    assert.equal("Empty field" in checkpoint.values, false, "nothing to restore, nothing stored");
    assert.equal("Submit application" in checkpoint.values, false, "buttons are not state");
  });

  it("never stores a redacted secret", async () => {
    const browser = stubBrowser([
      { ref: "e1", role: "text", name: "Email", tag: "input", value: "ada@example.com" },
      { ref: "e2", role: "password", name: "Password", tag: "input", inputType: "password", value: "***" },
    ]);
    const checkpoint = await saveCheckpoint(browser, { root, goalId: "goal_2", tag: "latest" });
    assert.deepEqual(Object.keys(checkpoint.values), ["Email"]);
  });

  it("round-trips through disk so a fresh process can restore", async () => {
    const browser = stubBrowser([
      { ref: "e1", role: "text", name: "Full name", tag: "input", value: "Ada Lovelace" },
    ]);
    await saveCheckpoint(browser, { root, goalId: "goal_3", tag: "latest" });

    const loaded = await loadCheckpoint(root, "goal_3", "latest");
    assert.equal(loaded?.url, "http://fixture.test/apply?step=2");
    assert.equal(loaded?.values["Full name"], "Ada Lovelace");
    assert.ok(loaded?.createdAt);
  });

  it("returns undefined when there is no checkpoint", async () => {
    assert.equal(await loadCheckpoint(root, "goal_none", "latest"), undefined);
  });
});
