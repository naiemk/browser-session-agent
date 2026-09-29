import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoalStore } from "../../src/core/state.ts";
import { goalPaths } from "../../src/core/paths.ts";
import {
  assembleCoderTask,
  bindAssemble,
  listingHasDeliverable,
  type AssembleSpec,
  type PlanExecuteAssemble,
} from "../../src/host/pi-assemble.ts";
import {
  bindPlanMode,
  HOST_ASSEMBLE_DISABLED_TOOLS,
  PLAN_COMMAND,
  REPORT_EXECUTE_HINT,
} from "../../src/host/pi-plan-mode.ts";
import {
  assembleStepNumber,
  deliverableNameFromStep,
  extractTodoItems,
  isAssembleRoleText,
  markCompletedSteps,
  preAssembleComplete,
} from "../../src/host/pi-plan-todos.ts";
import { createFakePi, runCommand } from "../helpers/fake-pi.ts";

const homes: string[] = [];

afterEach(async () => {
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
  delete process.env.BSA_CORE_HOME;
});

async function tempRoot(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-assemble-"));
  homes.push(home);
  process.env.BSA_CORE_HOME = home;
  return home;
}

const HARVEST_CSV_PLAN = `Plan:
1. Harvest the list from the page
2. Output CSV. Final portfolio.csv with columns: group, address
3. And report. scratch_read the finished CSV
`;

describe("harvest file assembly", () => {
  it("classifies Output CSV / Deliver, not scout setup or report", () => {
    assert.equal(isAssembleRoleText("Output CSV. Final portfolio.csv with columns: group, address"), true);
    assert.equal(
      isAssembleRoleText("Deliver: Save the final list of ~20 candidates to a file in the scratch"),
      true,
    );
    assert.equal(isAssembleRoleText("And report. scratch_read the finished CSV to confirm structure"), false);
    assert.equal(
      isAssembleRoleText("Setup (manifest). Have the coder subagent write addresses.csv"),
      false,
    );
    assert.equal(isAssembleRoleText("Record scout findings: Save the samples + notes"), false);
    assert.equal(isAssembleRoleText("Harvest (blocked on the coach artifact): Using the loop"), false);
    assert.equal(deliverableNameFromStep("Output CSV. Final portfolio.csv with columns"), "portfolio.csv");
    assert.equal(deliverableNameFromStep("Deliver: Save the final list to a file"), "candidates.csv");
  });

  it("does not let [DONE:n] complete a host-owned assemble step", () => {
    const items = extractTodoItems(HARVEST_CSV_PLAN);
    assert.equal(assembleStepNumber(items), 2);
    markCompletedSteps("Harvested. [DONE:1] [DONE:2]", items);
    assert.equal(items[0]?.completed, true);
    assert.equal(items[1]?.completed, false);
    assert.equal(preAssembleComplete(items), true);
  });

  it("host-assembles the CSV after harvest without the parent writing it", async () => {
    const pi = createFakePi();
    await pi.startSession();
    pi.setActiveTools([
      "observe",
      "act",
      "scratch_write",
      "save_artifact",
      "subagent",
      "remember",
    ]);
    const calls: AssembleSpec[] = [];
    let deliver: ((ctx: unknown, file: string) => void) | undefined;
    let wrote = false;
    const assemble: PlanExecuteAssemble = {
      enabled: () => false,
      hasDeliverable: async () => wrote,
      async startAssemble(ctx, spec) {
        calls.push(spec);
        wrote = true;
        deliver?.(ctx, "portfolio.csv");
        return true;
      },
      onDeliverable(handler) {
        deliver = handler;
      },
    };
    bindPlanMode(pi, { assemble });
    await runCommand(pi, PLAN_COMMAND, "");
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", content: [{ type: "text", text: HARVEST_CSV_PLAN }] }],
    });
    const harvestExec = pi.customMessages.find((message) => message.customType === "plan-mode-execute");
    assert.match(harvestExec?.content ?? "", /Harvest the list/);
    assert.doesNotMatch(harvestExec?.content ?? "", /Output CSV/);
    assert.doesNotMatch(harvestExec?.content ?? "", /And report/);
    for (const name of HOST_ASSEMBLE_DISABLED_TOOLS) {
      assert.equal(pi.getActiveTools().includes(name), false, name);
    }
    assert.equal(pi.getActiveTools().includes("subagent"), true);

    await pi.emit("turn_end", {
      message: { role: "assistant", content: "Harvested 48 addresses. [DONE:1]" },
    });
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", content: "Harvested 48 addresses. [DONE:1]" }],
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.text ?? "", /Output CSV/);
    const reportExec = pi.customMessages.filter((message) => message.customType === "plan-mode-execute").at(-1);
    assert.match(reportExec?.content ?? "", /And report/);
    assert.match(reportExec?.content ?? "", new RegExp(REPORT_EXECUTE_HINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(pi.getActiveTools().includes("scratch_write"), true);
  });

  it("does not assemble during scout", async () => {
    const pi = createFakePi();
    await pi.startSession();
    pi.setActiveTools(["observe", "act", "scratch_write", "subagent"]);
    const calls: AssembleSpec[] = [];
    bindPlanMode(pi, {
      assemble: {
        enabled: () => false,
        hasDeliverable: async () => false,
        async startAssemble(_ctx, spec) {
          calls.push(spec);
          return false;
        },
        onDeliverable() {},
      },
      coach: {
        enabled: () => false,
        hasArtifact: () => false,
        startReview: async () => false,
        onArtifact() {},
      },
    });
    await runCommand(pi, PLAN_COMMAND, "");
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Plan:
1. Scout (tight budget): probe two routes
2. Coach: Submit the scout
3. Harvest the list
4. Output CSV. Final portfolio.csv
`,
            },
          ],
        },
      ],
    });
    await pi.emit("turn_end", {
      message: { role: "assistant", content: "Scouted. [DONE:1]" },
    });
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", content: "Scouted. [DONE:1]" }],
    });
    assert.equal(calls.length, 0);
  });

  it("coder task reads facts.json and names the file", () => {
    const spec = { step: 5, text: "Output CSV. Final portfolio.csv with columns: group, address" };
    const task = assembleCoderTask(spec, "portfolio.csv");
    assert.match(task, /facts\.json/);
    assert.match(task, /portfolio\.csv/);
    assert.match(task, /date \+%Y-%m-%d/);
    assert.doesNotMatch(task, /paste/i);
  });

  it("writes the CSV from facts.json through coder, not the parent", async () => {
    const root = await tempRoot();
    const pi = createFakePi();
    await pi.startSession();
    const store = await GoalStore.open(root, "goal_csv", "harvest");
    await store.mergeGoalFacts({
      "addr1": { value: "Oldie 0xabc USDC 10", evidence: "ev1", at: "2026-09-16T18:00:00.000Z" },
    });
    const assemble = bindAssemble(pi, {
      goalId: "goal_csv",
      root,
      runtime: {
        async run(input) {
          assert.match(input.task, /facts\.json/);
          await writeFile(path.join(input.scratchDir, "portfolio.csv"), "group,address\nOldie,0xabc\n");
          return { agent: "coder", text: "wrote", exitCode: 0, stderr: "", aborted: false };
        },
      },
    });
    const ok = await assemble.startAssemble(pi.ctx, {
      step: 5,
      text: "Output CSV. Final portfolio.csv with columns: group, address",
    });
    assert.equal(ok, true);
    const scratch = await readFile(path.join(root, "goals", "goal_csv", "scratch", "portfolio.csv"), "utf8");
    assert.match(scratch, /0xabc/);
    const artifact = await readFile(path.join(goalPaths(root, "goal_csv").artifactsDir, "portfolio.csv"), "utf8");
    assert.match(artifact, /0xabc/);
    assert.equal(listingHasDeliverable([{ name: "portfolio.csv", bytes: 10 }], "portfolio.csv"), true);
    assert.equal(listingHasDeliverable([{ name: "facts.json", bytes: 99 }], "portfolio.csv"), false);
  });
});
