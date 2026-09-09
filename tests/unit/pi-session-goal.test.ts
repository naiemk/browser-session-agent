import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BSA_SUBAGENT_ENV,
  MAGPIE_GOAL_ENTRY,
  bindSessionGoal,
  isSubagentProcess,
  restoreGoalId,
} from "../../src/host/pi-session-goal.ts";
import browserSessionAgent from "../../src/extension.ts";
import { TOOL_REMEMBER } from "../../src/runtime/names.ts";
import { createFakePi, runTool } from "../helpers/fake-pi.ts";

const homes: string[] = [];
let previousCore: string | undefined;

afterEach(async () => {
  delete process.env[BSA_SUBAGENT_ENV];
  delete process.env.BSA_GOAL_ID;
  if (previousCore === undefined) delete process.env.BSA_CORE_HOME;
  else process.env.BSA_CORE_HOME = previousCore;
  previousCore = undefined;
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true });
  }
});

async function tempCore(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-session-goal-"));
  homes.push(home);
  previousCore = process.env.BSA_CORE_HOME;
  process.env.BSA_CORE_HOME = home;
  return home;
}

function goalFromEntries(pi: { entries: Array<{ customType: string; data?: unknown }> }): string {
  const id = restoreGoalId(pi.entries.map((entry) => ({ customType: entry.customType, data: entry.data })));
  assert.ok(id);
  return id;
}

describe("session-bound Magpie goal", () => {
  it("mints once on session_start and restores the same id from entries", async () => {
    const pi = createFakePi();
    const first = bindSessionGoal(pi);
    await pi.startSession();
    const minted = first.id();
    assert.match(minted, /^goal_/);
    assert.equal(pi.entries.filter((entry) => entry.customType === MAGPIE_GOAL_ENTRY).length, 1);

    const resume = createFakePi();
    resume.entries.push(...pi.entries);
    const second = bindSessionGoal(resume);
    await resume.startSession();
    assert.equal(second.id(), minted);
    assert.equal(resume.entries.filter((entry) => entry.customType === MAGPIE_GOAL_ENTRY).length, 1);
  });

  it("inherits BSA_GOAL_ID and does not append a magpie-goal as a child", async () => {
    process.env[BSA_SUBAGENT_ENV] = "1";
    process.env.BSA_GOAL_ID = "goal_parent";
    const pi = createFakePi();
    const bound = bindSessionGoal(pi);
    await pi.startSession();
    assert.equal(bound.id(), "goal_parent");
    assert.equal(pi.entries.filter((entry) => entry.customType === MAGPIE_GOAL_ENTRY).length, 0);
  });

  it("does not register Magpie tools when BSA_SUBAGENT=1", async () => {
    process.env[BSA_SUBAGENT_ENV] = "1";
    const pi = createFakePi();
    browserSessionAgent(pi);
    assert.equal(pi.tools.size, 0);
    assert.equal(pi.commands.size, 0);
    assert.equal(isSubagentProcess(), true);
  });

  it("files evidence under the restored goal, not a new directory", async () => {
    const home = await tempCore();
    const pi = createFakePi();
    browserSessionAgent(pi);
    await pi.startSession();
    await runTool(pi, TOOL_REMEMBER, { key: "who", value: "operator" });
    const goalId = goalFromEntries(pi);
    const dirs = await readdir(path.join(home, "goals"));
    assert.deepEqual(dirs, [goalId]);

    const resume = createFakePi();
    resume.entries.push(...pi.entries);
    browserSessionAgent(resume);
    await resume.startSession();
    await runTool(resume, TOOL_REMEMBER, { key: "who", value: "still operator" });
    const after = await readdir(path.join(home, "goals"));
    assert.deepEqual(after, [goalId]);
  });
});
