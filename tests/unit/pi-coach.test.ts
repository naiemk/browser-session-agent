import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import browserSessionAgent from "../../src/extension.ts";
import { bindCoach, COACH_CHECKPOINT_ENTRY, COACH_COMMAND } from "../../src/host/pi-coach.ts";
import { PLAN_COMMAND, PLAN_MODE_CONTEXT, SCOUT_EXECUTE_HINT } from "../../src/host/pi-plan-mode.ts";
import {
  coachStepNumber,
  executorRemaining,
  extractTodoItems,
  preCoachComplete,
} from "../../src/host/pi-plan-todos.ts";
import { extensionContext } from "../../src/host/memory-host.ts";
import { NodeHub } from "../../src/hosts/web/hub.ts";
import { OperatorRuntime } from "../../src/hosts/web/runtime.ts";
import { memoryEvidence } from "../../src/runtime/evidence.ts";
import { createFakePi, runCommand, runTool } from "../helpers/fake-pi.ts";
import { SUBAGENT_TOOL_NAME } from "../../src/host/pi-subagent/bind.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const homes: string[] = [];
let previousCore: string | undefined;

afterEach(async () => {
  if (previousCore === undefined) delete process.env.BSA_CORE_HOME;
  else process.env.BSA_CORE_HOME = previousCore;
  previousCore = undefined;
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function tempCore(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-coach-"));
  homes.push(home);
  previousCore = process.env.BSA_CORE_HOME;
  process.env.BSA_CORE_HOME = home;
  return home;
}

const ARTIFACT = {
  schemaVersion: 1,
  summary: "Venue tagged posts then peek.",
  loop: ["Search venues", "Open tagged", "Peek profiles; keep the list"],
  qualify: ["Apply the goal criteria; do not loosen them"],
  exceptions: [],
  record: ["candidate_accepted after a peek"],
  stop: ["After 8 accepts"],
  doNot: ["Navigate away and Back"],
  confidence: "medium",
  falsify: "Tagged grid empty on two venues",
  assumptions: [],
};

describe("AGENT-16-T03 interactive /coach", () => {
  it("plan-mode context requires scout → coach → harvest and forbids tactic lists", () => {
    assert.match(PLAN_MODE_CONTEXT, /scout/i);
    assert.match(PLAN_MODE_CONTEXT, /coach/i);
    assert.match(PLAN_MODE_CONTEXT, /harvest/i);
    assert.match(PLAN_MODE_CONTEXT, /MUST NOT invent a list of site tactics/i);
    assert.match(PLAN_MODE_CONTEXT, /calibration_required/);
  });

  it("/coach disables act / save / subagent while the review turn runs", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    assert.equal(pi.getActiveTools().includes("act"), true);
    await runCommand(pi, COACH_COMMAND, "");
    assert.equal(pi.getActiveTools().includes("act"), false);
    assert.equal(pi.getActiveTools().includes("save_artifact"), false);
    assert.equal(pi.getActiveTools().includes("subagent"), false);
    assert.equal(pi.getActiveTools().includes("observe"), true);
    assert.match(pi.notifications.join("\n"), /mutations off/i);
    assert.ok(pi.userMessages.some((text) => text.includes("[COACH REVIEW]")));
  });

  it("replaces the session transcript with the digest for the coach model", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await runCommand(pi, COACH_COMMAND, "");
    const results = await pi.emit("context", {
      messages: [
        { role: "user", content: "controls: [{ref: e1, name: Submit}]" },
        { role: "assistant", content: "I clicked around" },
      ],
    });
    const coach = [...results]
      .reverse()
      .find(
        (result) =>
          result &&
          typeof result === "object" &&
          JSON.stringify(result).includes("[COACH REVIEW]"),
      );
    const payload = JSON.stringify(coach);
    assert.doesNotMatch(payload, /controls:/);
    assert.match(payload, /Trajectory digest/);
    assert.match(payload, /\[COACH REVIEW\]/);
  });

  it("persists a Fake assistant JSON artifact and restores it on session_start", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await runCommand(pi, COACH_COMMAND, "");
    await pi.emit("turn_end", {
      message: { role: "assistant", content: JSON.stringify(ARTIFACT) },
    });
    assert.ok(pi.entries.some((entry) => entry.customType === COACH_CHECKPOINT_ENTRY));
    assert.equal(pi.getActiveTools().includes("act"), true);
    assert.ok(pi.customMessages.some((message) => /STRATEGY/.test(message.content)));

    const resume = createFakePi();
    resume.entries.push(...pi.entries);
    browserSessionAgent(resume);
    await resume.startSession();
    const injected = await resume.emit("before_agent_start", {});
    const text = JSON.stringify(injected);
    assert.match(text, /STRATEGY/);
    assert.match(text, /Peek profiles/);
    assert.doesNotMatch(text, /"actions":/);
  });

  it("rejects subagent({ agent: coach })", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    const result = await runTool(pi, SUBAGENT_TOOL_NAME, { agent: "coach", task: "write a strategy" });
    const text = result.content.map((part) => ("text" in part ? part.text : "")).join("");
    assert.match(text, /\/coach/);
    assert.equal(result.details?.error, "coach_not_a_worker");
  });

  it("hosted /coach disables act on the real session tools", async () => {
    await tempCore();
    const notes: string[] = [];
    const runtime = new OperatorRuntime(new NodeHub(), (message) => {
      if (message.type === "notify") notes.push(message.message);
    });
    runtime.host.setActiveTools(["observe", "act", "probe", "ask_user", "subagent", "save_artifact"]);
    await runtime.api.commands.get(COACH_COMMAND)?.handler("", extensionContext(runtime.host));
    assert.match(notes.join("\n"), /mutations off/i);
    assert.equal(runtime.host.getActiveTools().includes("act"), false);
    assert.equal(runtime.host.getActiveTools().includes("subagent"), false);
    assert.equal(runtime.host.getActiveTools().includes("observe"), true);
  });

  it("bindCoach compiles from memoryEvidence without a provider", async () => {
    const pi = createFakePi();
    const evidence = memoryEvidence();
    await evidence.ledger.append({
      type: "action",
      intent: "open list",
      action: { kind: "click" },
      after: { url: "https://example.test/list", title: "List", changes: [] },
      outcome: { ok: true },
    });
    bindCoach(pi, { evidence, objective: "collect", criteria: ["nightlife"] });
    await pi.startSession();
    await runCommand(pi, COACH_COMMAND, "");
    const digest = pi.userMessages.join("\n");
    assert.match(digest, /collect/);
    assert.doesNotMatch(digest, /controls:/);
  });

  it("exposes /coach on the hosted chat command bar", async () => {
    const source = await readFile(path.join(ROOT, "src/hosts/web/public/app.js"), "utf8");
    assert.match(source, /\["coach", "Review-phase strategy coach"\]/);
  });
});

const CALIBRATION_PLAN = `Plan:
1. Establish identity & access: Log into instagram.com, confirm which account
2. Scout (tight budget): Probe 3–4 discovery routes with a small cap each
3. Record scout findings: Save the samples + notes on which routes yield
4. Coach: Submit the scout artifact for coaching to turn "popular party goer" into criteria
5. Harvest (blocked on coach artifact): Using the coached criteria and the best loop
6. Dedupe & quality pass: Remove duplicates, business/club accounts, and extras
7. Deliver: Save the final list of ~20 candidates to a file in the scratch
`;

function executeContent(pi: ReturnType<typeof createFakePi>): string {
  return pi.customMessages
    .filter((message) => message.customType === "plan-mode-execute")
    .map((message) => message.content)
    .join("\n---\n");
}

async function executeNumberedPlan(pi: ReturnType<typeof createFakePi>, plan: string): Promise<void> {
  await runCommand(pi, PLAN_COMMAND, "");
  await pi.emit("agent_end", {
    messages: [{ role: "assistant", content: [{ type: "text", text: plan }] }],
  });
}

describe("AGENT-16-T05 Magpie Execute invokes /coach", () => {
  it("classifies live goal_mtumeewm001 todo strings: coach is step 4, harvest still contains the word", () => {
    const items = extractTodoItems(CALIBRATION_PLAN);
    assert.equal(items.length, 7);
    assert.equal(coachStepNumber(items), 4);
    assert.match(items[3]?.text ?? "", /^Coach:/);
    assert.match(items[4]?.text ?? "", /Harvest.*coach/i);
    const pre = items.filter((item) => item.step < 4);
    assert.equal(pre.length, 3);
    assert.equal(preCoachComplete(items), false);
    for (const item of pre) item.completed = true;
    assert.equal(preCoachComplete(items), true);
    const scout = executorRemaining(items, false);
    assert.equal(scout.length, 0);
    assert.equal(scout.some((item) => /^Coach:/i.test(item.text)), false);
    const harvest = executorRemaining(items, true);
    assert.ok(harvest.some((item) => /^Harvest/i.test(item.text)));
    assert.equal(harvest.some((item) => /^Coach:/i.test(item.text)), false);
  });

  it("Execute remaining-steps omit Coach: Submit and Harvest until an artifact exists", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await executeNumberedPlan(pi, CALIBRATION_PLAN);
    const exec = executeContent(pi);
    assert.match(exec, /scout only/i);
    assert.match(exec, /Scout \(tight budget\)/);
    assert.match(exec, /Record scout findings/);
    assert.match(exec, new RegExp(SCOUT_EXECUTE_HINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(exec, /Coach: Submit/);
    assert.doesNotMatch(exec, /Harvest \(blocked/);
    const injected = await pi.emit("before_agent_start", {});
    const text = JSON.stringify(injected);
    assert.match(text, /scout only/i);
    assert.doesNotMatch(text, /Coach: Submit/);
    assert.doesNotMatch(text, /Harvest \(blocked/);
  });

  it("pre-coach [DONE:n] then agent_end runs the T03 coach handler", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await executeNumberedPlan(pi, CALIBRATION_PLAN);
    assert.equal(pi.getActiveTools().includes("act"), true);
    await pi.emit("turn_end", {
      message: {
        role: "assistant",
        content: "Identity, scout, and notes recorded. [DONE:1] [DONE:2] [DONE:3]",
      },
    });
    assert.equal(pi.getActiveTools().includes("act"), true);
    assert.equal(pi.userMessages.some((text) => text.includes("[COACH REVIEW]")), false);
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          content: "Identity, scout, and notes recorded. [DONE:1] [DONE:2] [DONE:3]",
        },
      ],
    });
    assert.equal(pi.getActiveTools().includes("act"), false);
    assert.equal(pi.getActiveTools().includes("save_artifact"), false);
    assert.equal(pi.getActiveTools().includes("subagent"), false);
    assert.ok(pi.userMessages.some((text) => text.includes("[COACH REVIEW]")));
    assert.match(pi.notifications.join("\n"), /mutations off/i);
  });

  it("accepted artifact marks the coach todo complete and injects Harvest, not a second review", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await executeNumberedPlan(pi, CALIBRATION_PLAN);
    await pi.emit("turn_end", {
      message: {
        role: "assistant",
        content: "[DONE:1] [DONE:2] [DONE:3]",
      },
    });
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", content: "[DONE:1] [DONE:2] [DONE:3]" }],
    });
    await pi.emit("turn_end", {
      message: { role: "assistant", content: JSON.stringify(ARTIFACT) },
    });
    assert.ok(pi.entries.some((entry) => entry.customType === COACH_CHECKPOINT_ENTRY));
    assert.equal(pi.getActiveTools().includes("act"), true);
    const plan = [...pi.entries].reverse().find((entry) => entry.customType === "plan-mode") as
      | { data?: { todos?: Array<{ text: string; completed: boolean }> } }
      | undefined;
    const coachTodo = plan?.data?.todos?.find((todo) => /^Coach:/i.test(todo.text));
    assert.equal(coachTodo?.completed, true);
    const harvestExec = pi.customMessages.filter((message) => message.customType === "plan-mode-execute").at(-1);
    assert.match(harvestExec?.content ?? "", /Harvest \(blocked/);
    assert.doesNotMatch(harvestExec?.content ?? "", /Coach: Submit/);
    assert.doesNotMatch(harvestExec?.content ?? "", /scout only/i);
    const reviewStarts = pi.userMessages.filter((text) => text.includes("[COACH REVIEW]"));
    assert.equal(reviewStarts.length, 1);
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", content: JSON.stringify(ARTIFACT) }],
    });
    assert.equal(pi.userMessages.filter((text) => text.includes("[COACH REVIEW]")).length, 1);
    const injected = await pi.emit("before_agent_start", {});
    const text = JSON.stringify(injected);
    assert.match(text, /STRATEGY/);
    assert.match(text, /Harvest \(blocked/);
    assert.doesNotMatch(text, /Coach: Submit/);
  });

  it("known_flow Execute does not start review", async () => {
    await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await executeNumberedPlan(
      pi,
      "Plan:\n1. Open the jobs page first\n2. Collect every listing next\n",
    );
    const exec = executeContent(pi);
    assert.doesNotMatch(exec, /scout only/i);
    assert.match(exec, /jobs page/i);
    await pi.emit("turn_end", {
      message: { role: "assistant", content: "Opened. [DONE:1]" },
    });
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", content: "Opened. [DONE:1]" }],
    });
    assert.equal(pi.userMessages.some((text) => text.includes("[COACH REVIEW]")), false);
    assert.equal(pi.getActiveTools().includes("act"), true);
  });
});
