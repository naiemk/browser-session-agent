import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateExpectation, recoveryNote } from "../src/domain/verification.ts";
import { assertCanAct } from "../src/domain/ownership.ts";
import { AgentError, type Observation, type RunState, type TabRecord } from "../src/domain/types.ts";
import { diffControls } from "../src/domain/observe-diff.ts";
import { parseStartArgs } from "../src/session.ts";
import { KnowledgeStore } from "../src/store/knowledge-store.ts";
import { RunStore } from "../src/store/run-store.ts";
import { nowIso } from "../src/domain/ids.ts";
import { tempHome } from "./helpers/temp-home.ts";
import { createFakePi, runCommand, runTool } from "./helpers/fake-pi.ts";
import browserSessionAgent from "../src/extension.ts";

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
    expect(evaluateExpectation(undefined, observation(), "").status).toBe("inconclusive");
  });

  it("fails urlIncludes and builds a recovery note", () => {
    const verification = evaluateExpectation(
      { urlIncludes: "/jobs", textVisible: "Thanks" },
      observation(),
      "Application",
    );
    expect(verification.status).toBe("failed");
    const note = recoveryNote(verification, observation());
    expect(note).toContain("/apply");
    expect(note).toContain("Thanks");
  });

  it("passes when URL, text, and ref match", () => {
    const verification = evaluateExpectation(
      { urlIncludes: "/apply", textVisible: "Application", refExists: "e1" },
      observation(),
      "Application form",
    );
    expect(verification.status).toBe("passed");
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
    expect(() => assertCanAct(run("awaiting_takeover"), [tab({ locked: false })], "tab_1")).toThrow(
      AgentError,
    );
    expect(() => assertCanAct(run("paused"), [tab()], "tab_1")).toThrow(AgentError);
    expect(() =>
      assertCanAct(run("active"), [tab({ ownerRunId: "run_other" })], "tab_1"),
    ).toThrow(/not owned/);
    expect(() => assertCanAct(run("active"), [tab({ locked: false })], "tab_1")).toThrow(
      /exclusive lock/,
    );
  });

  it("allows an active owned locked tab", () => {
    expect(assertCanAct(run("active"), [tab()], "tab_1").tabId).toBe("tab_1");
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
    expect(changes.some((c) => c.includes("added e2"))).toBe(true);
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
      expect((await runs.events("run_1"))[0].id).toBe(event.id);

      const knowledge = new KnowledgeStore(home);
      const fact = await knowledge.propose({
        kind: "user_fact",
        text: "Preferred location is remote",
        sourceRunId: "run_1",
        evidenceEventIds: [event.id],
      });
      expect(await knowledge.search("remote location")).toEqual([]);
      await knowledge.setStatus(fact.id, "approved");
      const hits = await knowledge.search("remote location");
      expect(hits[0]?.id).toBe(fact.id);
      expect(hits[0]?.evidenceEventIds).toContain(event.id);

      const failed = await knowledge.propose({
        kind: "strategy",
        text: "spam every listing",
        sourceRunId: "run_1",
        evidenceEventIds: [event.id],
        outcome: "failed",
      });
      expect((await knowledge.search("spam listing")).some((r) => r.id === failed.id)).toBe(false);

      const strategy = await knowledge.propose({
        kind: "strategy",
        text: "fill name then email then submit",
        sourceRunId: "run_1",
        evidenceEventIds: [event.id],
        outcome: "completed",
      });
      expect((await knowledge.search("fill name email submit"))[0]?.id).toBe(strategy.id);
    } finally {
      await cleanup();
    }
  });
});

describe("parseStartArgs", () => {
  it("reads --url and embedded URLs", () => {
    expect(parseStartArgs("--url https://jobs.example Apply")).toEqual({
      url: "https://jobs.example",
      goal: "Apply",
    });
    expect(parseStartArgs("Apply at https://jobs.example/x")).toMatchObject({
      url: "https://jobs.example/x",
    });
  });
});

describe("Pi package and extension contract", () => {
  it("declares a pi extension entry", async () => {
    const pkg = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.keywords).toContain("pi-package");
    expect(pkg.pi.extensions).toEqual(["./src/extension.ts"]);
  });

  it("registers tools and commands and reports status without a run", async () => {
    const pi = createFakePi();
    browserSessionAgent(pi);
    expect(pi.tools.has("browser_inspect")).toBe(true);
    expect(pi.commands.has("browser-status")).toBe(true);
    expect(pi.commands.has("browser-start")).toBe(true);
    await runCommand(pi, "browser-status");
    expect(pi.notifications.at(-1)).toContain("currentRun");
    const result = await runTool(pi, "browser_inspect", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text: string }).text).toMatch(/run_inactive/);
  });
});
