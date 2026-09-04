import assert from "node:assert/strict";
import { TOOL_ACT, TOOL_OBSERVE } from "../../src/runtime/names.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { evaluateExpectation, recoveryNote } from "../../src/domain/verification.ts";
import { assertCanAct } from "../../src/domain/ownership.ts";
import { AgentError, type Observation, type RunState, type TabRecord } from "../../src/domain/types.ts";
import { diffControls, isEditorControl, truncateControls } from "../../src/domain/observe-diff.ts";
import { parseStartArgs } from "../../src/session.ts";
import { KnowledgeStore } from "../../src/store/knowledge-store.ts";
import { RunStore } from "../../src/store/run-store.ts";
import { nowIso } from "../../src/domain/ids.ts";
import { tempHome } from "../helpers/temp-home.ts";
import { createFakePi, runCommand, runTool } from "../helpers/fake-pi.ts";
import browserSessionAgent from "../../src/extension.ts";

function observation(partial: Partial<Observation> = {}): Observation {
  return {
    id: "obs_1",
    tabId: "tab_1",
    url: "http://127.0.0.1:9/apply",
    title: "Apply",
    controls: [{ ref: "e1", role: "button", name: "Submit", tag: "button" }],
    dialogs: [],
    errors: [],
    consoleErrors: [],
    recentChanges: [],
    ...partial,
  };
}

describe("verification", () => {
  it("is inconclusive without expect", () => {
    assert.equal(evaluateExpectation(undefined, observation(), "").status, "inconclusive");
  });

  it("fails urlIncludes and builds a recovery note", () => {
    const verification = evaluateExpectation(
      { urlIncludes: "/jobs", textVisible: "Thanks" },
      observation(),
      "Application",
    );
    assert.equal(verification.status, "failed");
    const note = recoveryNote(verification, observation());
    assert.match(note, /\/apply/);
    assert.match(note, /Thanks/);
  });

  it("passes when URL, text, and ref match", () => {
    const verification = evaluateExpectation(
      { urlIncludes: "/apply", textVisible: "Application", refExists: "e1" },
      observation(),
      "Application form",
    );
    assert.equal(verification.status, "passed");
  });
});

describe("ownership", () => {
  const run = (status: RunState["status"]): RunState => ({
    runId: "run_1",
    goal: "apply",
    status,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ownedTabIds: ["tab_1"],
    currentTabId: "tab_1",
    lastObservationId: null,
    attention: [],
  });

  const tab = (over: Partial<TabRecord> = {}): TabRecord => ({
    tabId: "tab_1",
    ownerRunId: "run_1",
    locked: true,
    url: "http://example",
    title: "x",
    ...over,
  });

  it("rejects takeover, pause, and foreign tabs", () => {
    assert.throws(
      () => assertCanAct(run("awaiting_takeover"), [tab({ locked: false })], "tab_1"),
      AgentError,
    );
    assert.throws(() => assertCanAct(run("paused"), [tab()], "tab_1"), AgentError);
    assert.throws(
      () => assertCanAct(run("active"), [tab({ ownerRunId: "run_other" })], "tab_1"),
      /not owned/,
    );
    assert.throws(
      () => assertCanAct(run("active"), [tab({ locked: false })], "tab_1"),
      /exclusive lock/,
    );
  });

  it("allows an active owned locked tab", () => {
    assert.equal(assertCanAct(run("active"), [tab()], "tab_1").tabId, "tab_1");
  });
});

describe("observe diff", () => {
  it("reports added controls", () => {
    const changes = diffControls(
      [{ ref: "e1", role: "button", name: "Reveal", tag: "button" }],
      [
        { ref: "e1", role: "button", name: "Reveal", tag: "button" },
        { ref: "e2", role: "button", name: "Continue application", tag: "button" },
      ],
    );
    assert.ok(changes.some((c) => c.includes("added e2")));
  });

  it("keeps editors when truncating a crowded snapshot", () => {
    const editor = {
      ref: "e90",
      role: "textbox",
      name: "JSON editor",
      tag: "textarea",
      inputType: "textarea",
    };
    const controls = [
      { ref: "e1", role: "link", name: "JSONLint", tag: "a" },
      ...Array.from({ length: 85 }, (_, i) => ({
        ref: `b${i}`,
        role: "link",
        name: `nav ${i}`,
        tag: "a",
      })),
      editor,
    ];
    const truncated = truncateControls(controls);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.controls.length, 80);
    assert.ok(truncated.controls.some((c) => c.ref === "e90"));
    assert.equal(isEditorControl(editor), true);
    assert.equal(isEditorControl({ ref: "e1", role: "link", name: "JSONLint", tag: "a" }), false);
  });
});

describe("stores", () => {
  it("persists run events and knowledge approval", async () => {
    const { home, cleanup } = await tempHome();
    try {
      const runs = new RunStore(home);
      await runs.init();
      await runs.create({
        runId: "run_1",
        goal: "apply",
        status: "active",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ownedTabIds: [],
        currentTabId: null,
        lastObservationId: null,
        attention: [],
      });
      const event = await runs.append("run_1", "observation", { url: "http://x" });
      assert.equal((await runs.events("run_1"))[0].id, event.id);

      const knowledge = new KnowledgeStore(home);
      const fact = await knowledge.propose({
        kind: "user_fact",
        text: "Preferred location is remote",
        sourceRunId: "run_1",
        evidenceEventIds: [event.id],
      });
      assert.deepEqual(await knowledge.search("remote location"), []);
      await knowledge.setStatus(fact.id, "approved");
      const hits = await knowledge.search("remote location");
      assert.equal(hits[0]?.id, fact.id);
      assert.ok(hits[0]?.evidenceEventIds.includes(event.id));

      const failed = await knowledge.propose({
        kind: "strategy",
        text: "spam every listing",
        sourceRunId: "run_1",
        evidenceEventIds: [event.id],
        outcome: "failed",
      });
      assert.equal(
        (await knowledge.search("spam listing")).some((r) => r.id === failed.id),
        false,
      );

      const strategy = await knowledge.propose({
        kind: "strategy",
        text: "fill name then email then submit",
        sourceRunId: "run_1",
        evidenceEventIds: [event.id],
        outcome: "completed",
      });
      assert.equal((await knowledge.search("fill name email submit"))[0]?.id, strategy.id);
    } finally {
      await cleanup();
    }
  });
});

describe("parseStartArgs", () => {
  it("reads --url and embedded URLs", () => {
    assert.deepEqual(parseStartArgs("--url https://jobs.example Apply"), {
      url: "https://jobs.example",
      goal: "Apply",
    });
    assert.equal(parseStartArgs("Apply at https://jobs.example/x").url, "https://jobs.example/x");
  });
});

describe("Pi package and extension contract", () => {
  it("declares a pi extension entry", async () => {
    const pkg = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    assert.ok(pkg.keywords.includes("pi-package"));
    assert.deepEqual(pkg.pi.extensions, ["./src/extension.ts"]);
  });

  it("registers the agent's tools and the product's commands", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);

    // The agent's capabilities come from composeAgent; the commands are the product's
    // run lifecycle. Previously both came from one place, which is how the agent's tools
    // ended up gated on a *run* being active.
    assert.equal(pi.tools.has(TOOL_OBSERVE), true);
    assert.equal(pi.tools.has(TOOL_ACT), true);
    assert.equal(pi.tools.has("browser_inspect"), false, "the legacy tool set is gone");

    assert.equal(pi.commands.has("browser-status"), true);
    assert.equal(pi.commands.has("browser-start"), true);
    await runCommand(pi, "browser-status");
    assert.match(pi.notifications.at(-1) ?? "", /currentRun/);
  });

  it("replaces the coding identity rather than appending to it", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);

    const hook = pi.handlers.get("before_agent_start");
    const result = (await hook?.({ systemPrompt: "You are a coding agent." })) as {
      systemPrompt?: string;
    };

    assert.ok(result?.systemPrompt, "the hook must supply a prompt");
    assert.doesNotMatch(
      result.systemPrompt!,
      /You are a coding agent\./,
      "appending is why the chat used to answer 'what can you do?' like a coding assistant",
    );
    assert.match(result.systemPrompt!, /You drive a real web browser/);
  });
});
