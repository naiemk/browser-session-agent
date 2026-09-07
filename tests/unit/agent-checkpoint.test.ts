import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { loadCheckpoint, saveCheckpoint } from "../../src/core/checkpoint.ts";
import { guardedAct } from "../../src/core/gate.ts";
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

function observationOf(state: {
  url: string;
  title: string;
  text: string;
  controls: Control[];
  changes: string[];
  id: string;
}): Observation {
  return {
    id: state.id,
    tabId: "tab_1",
    url: state.url,
    title: state.title,
    controls: state.controls,
    dialogs: [],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: state.changes,
    capturedAt: new Date().toISOString(),
  };
}

/** A stub that can click away and navigate back, so restore is observable. */
function mutatingBrowser(start: { url: string; title: string; text: string; controls: Control[] }): BrowserPort {
  const home = {
    url: start.url,
    title: start.title,
    text: start.text,
    controls: start.controls.map((control) => ({ ...control })),
  };
  let url = home.url;
  let title = home.title;
  let text = home.text;
  let controls = home.controls.map((control) => ({ ...control }));
  let changes: string[] = [];
  let seq = 1;

  const snapshot = (): Observation =>
    observationOf({ url, title, text, controls, changes, id: `obs_${seq}` });
  const factsOf = (): PageFacts => ({ url, title, text, observation: snapshot() });

  return {
    observe: async () => {
      const seen = snapshot();
      changes = [];
      return seen;
    },
    facts: async () => factsOf(),
    lastObservation: () => snapshot(),
    navigate: async (_tab, next) => {
      url = next;
      if (next === home.url) {
        title = home.title;
        text = home.text;
        controls = home.controls.map((control) => ({ ...control }));
      } else {
        title = "Elsewhere";
        text = "gone";
        controls = [];
      }
      changes = ["navigated"];
      seq += 1;
    },
    click: async () => {
      url = `${home.url}/elsewhere`;
      title = "Elsewhere";
      text = "gone";
      controls = [];
      changes = ["clicked"];
      seq += 1;
    },
    fill: async (_tab, ref, value) => {
      const target = controls.find((control) => control.ref === ref);
      if (target) target.value = value;
      changes = ["filled"];
      seq += 1;
    },
    selectOption: async (_tab, ref, value) => {
      const target = controls.find((control) => control.ref === ref);
      if (target) target.value = value;
      changes = ["selected"];
      seq += 1;
    },
    screenshot: async () => undefined,
    waitFor: async () => undefined,
    scroll: async () => undefined,
    setInputFiles: async () => undefined,
  } as BrowserPort;
}

describe("unknown exploration checkpoints", () => {
  it("writes a checkpoint before an unmatched click", async () => {
    const browser = mutatingBrowser({
      url: "http://fixture.test/home",
      title: "Home",
      text: "Users",
      controls: [{ ref: "e1", role: "button", name: "Users", tag: "button" }],
    });
    const outcome = await guardedAct(
      browser,
      { kind: "click", ref: "e1" },
      { checkpoint: { root, goalId: "goal_unknown", tag: "latest" }, settleMs: 0, policy: "ask" },
    );
    assert.equal(outcome.status, "acted");
    const saved = await loadCheckpoint(root, "goal_unknown", "latest");
    assert.ok(saved, "an unknown click must leave a way back");
    assert.equal(saved.url, "http://fixture.test/home");
  });

  it("restores when an unknown click's expect fails", async () => {
    const browser = mutatingBrowser({
      url: "http://fixture.test/home",
      title: "Home",
      text: "Users",
      controls: [
        { ref: "e1", role: "button", name: "Users", tag: "button" },
        { ref: "e2", role: "text", name: "Query", tag: "input", value: "ada" },
      ],
    });
    const outcome = await guardedAct(
      browser,
      { kind: "click", ref: "e1", expect: { kind: "text_visible", text: "this is not on the page" } },
      {
        checkpoint: { root, goalId: "goal_restore_expect", tag: "latest" },
        settleMs: 0,
        policy: "never",
      },
    );
    assert.equal(outcome.status, "acted");
    if (outcome.status === "acted") {
      assert.equal(outcome.result.ok, false);
      assert.equal(outcome.result.restored, true);
      assert.equal(outcome.result.observation.url, "http://fixture.test/home");
      assert.match(outcome.result.failure?.recovery ?? "", /Restored the previous page/);
    }
  });

  it("does not ask the operator for unmatched exploration, even under ask/never", async () => {
    const page = {
      url: "http://fixture.test/home",
      title: "Home",
      text: "Users",
      controls: [{ ref: "e1", role: "button", name: "Users", tag: "button" as const }],
    };
    let asked = 0;
    const askedOutcome = await guardedAct(
      mutatingBrowser(page),
      { kind: "click", ref: "e1" },
      {
        policy: "ask",
        settleMs: 0,
        approve: async () => {
          asked += 1;
          return false;
        },
      },
    );
    assert.equal(askedOutcome.status, "acted");
    assert.equal(asked, 0);
    const refused = await guardedAct(
      mutatingBrowser(page),
      { kind: "click", ref: "e1" },
      { policy: "never", settleMs: 0 },
    );
    assert.equal(refused.status, "acted");
  });

  it("runs Current companies under ask and still parks Invite to connect", async () => {
    const page = {
      url: "https://www.linkedin.com/search/results/people/",
      title: "Search | LinkedIn",
      text: "People",
      controls: [
        { ref: "e106", role: "button", name: "Current companies", tag: "button" as const },
        { ref: "e90", role: "link", name: "Invite Ali to connect", tag: "a" as const },
      ],
    };
    let asked = 0;
    const filter = await guardedAct(
      mutatingBrowser(page),
      { kind: "click", ref: "e106" },
      {
        policy: "ask",
        settleMs: 0,
        approve: async () => {
          asked += 1;
          return false;
        },
      },
    );
    assert.equal(filter.status, "acted", "filter chips are exploration");
    assert.equal(asked, 0);

    const invite = await guardedAct(
      mutatingBrowser(page),
      { kind: "click", ref: "e90" },
      {
        policy: "ask",
        settleMs: 0,
        approve: async () => {
          asked += 1;
          return false;
        },
      },
    );
    assert.equal(invite.status, "parked", "sending an invite is a world-commit");
    assert.equal(asked, 1);
    if (invite.status === "parked") {
      assert.match(invite.parked.reason, /outbound/i);
      assert.doesNotMatch(invite.parked.reason, /no rule matched/);
    }
  });

  it("reloads the latest checkpoint on act kind restore", async () => {
    const browser = mutatingBrowser({
      url: "http://fixture.test/home",
      title: "Home",
      text: "here",
      controls: [
        { ref: "e1", role: "button", name: "Users", tag: "button" },
        { ref: "e2", role: "text", name: "Query", tag: "input", value: "ada" },
      ],
    });
    await guardedAct(
      browser,
      { kind: "click", ref: "e1" },
      { checkpoint: { root, goalId: "goal_restore_kind", tag: "latest" }, settleMs: 0 },
    );
    assert.equal((await browser.facts()).url, "http://fixture.test/home/elsewhere");

    const outcome = await guardedAct(
      browser,
      { kind: "restore" },
      { checkpoint: { root, goalId: "goal_restore_kind", tag: "latest" }, settleMs: 0 },
    );
    assert.equal(outcome.status, "acted");
    if (outcome.status === "acted") {
      assert.equal(outcome.result.ok, true);
      assert.equal(outcome.result.kind, "restore");
      assert.equal(outcome.result.restored, true);
      assert.equal(outcome.result.observation.url, "http://fixture.test/home");
    }
  });
});
