import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { TaskStore } from "../../src/core/task.ts";
import { evaluateTask } from "../../src/core/evaluator.ts";
import { actStep, createMockModel } from "../../src/runtime/mock-model.ts";
import { TOOL_CHECK, TOOL_DONE, TOOL_OBSERVE, TOOL_PROBE } from "../../src/runtime/names.ts";
import { runTask } from "../../src/runtime/runtime.ts";
import { toWireObservation, wireText } from "../../src/runtime/wire.ts";
import { ledgerEvidence } from "../helpers/evidence.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * The whole stack with no model bill: real browser, real Pi loop, real tools, real
 * verification, real commit gate, real criteria. Only the model's judgement is scripted.
 */

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "runtime-e2e-"));
});

after(async () => {
  await browser?.close();
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

async function harness(page: string, goalId: string) {
  const tab = await browser.openTab(`${origin}${page}`);
  const ledger = await Ledger.open(root, goalId);
  const store = await TaskStore.open(root, goalId);
  return { tab, ledger, store };
}

describe("runtime end to end with a mock model", () => {
  it("completes an application and the criteria agree", async () => {
    const { tab, ledger, store } = await harness("/apply", "g_apply");
    const criteria = [{ kind: "text_visible" as const, text: "Thanks Ada Lovelace" }];
    const task = await store.create({ objective: "Apply as Ada Lovelace", criteria });

    const outcome = await runTask({
      card: { objective: "Apply as Ada Lovelace", criteria, policy: "auto" },
      stream: createMockModel({
        plan: [
          actStep("type", "Full name", { text: "Ada Lovelace" }),
          actStep("type", "Email", { text: "ada@example.com" }),
          actStep("click", "Submit application"),
        ],
      }),
      tools: { browser, tabId: tab, evidence: ledgerEvidence(ledger), policy: "auto" },
    });

    assert.equal(outcome.report?.status, "success");
    assert.deepEqual(outcome.modelErrors, []);

    const evaluation = await evaluateTask({
      store,
      taskId: task.taskId,
      browser,
      ledger,
      tabId: tab,
      claim: outcome.report?.summary,
    });
    assert.equal(evaluation.status, "success");

    // The whole story is on disk, not just in the transcript.
    const events = await ledger.read();
    assert.ok(events.some((event) => event.action?.kind === "type"));
    assert.ok(
      events.some((event) => event.type === "approval" && event.action?.reversibility === "committing"),
      "the submit went through the gate",
    );
  });

  it("does not let a lying agent turn a failure into a success", async () => {
    const { tab, ledger, store } = await harness("/apply", "g_liar");
    const criteria = [{ kind: "text_visible" as const, text: "Thanks Ada Lovelace" }];
    const task = await store.create({ objective: "Apply as Ada Lovelace", criteria });

    const outcome = await runTask({
      card: { objective: "Apply as Ada Lovelace", criteria, policy: "auto" },
      stream: createMockModel({
        script: [
          {
            text: "Submitted it.",
            calls: [{ name: TOOL_DONE, arguments: { status: "success", summary: "submitted" } }],
          },
        ],
      }),
      tools: { browser, tabId: tab, evidence: ledgerEvidence(ledger), policy: "auto" },
    });

    assert.equal(outcome.report?.status, "success", "the agent claimed success");

    const evaluation = await evaluateTask({
      store,
      taskId: task.taskId,
      browser,
      ledger,
      tabId: tab,
      claim: outcome.report?.summary,
    });
    assert.notEqual(evaluation.status, "success", "the page disagrees, and the page wins");
  });

  it("blocks an irreversible action when the operator declines", async () => {
    const { tab, ledger } = await harness("/once", "g_gate");
    let asked = 0;

    const outcome = await runTask({
      card: {
        objective: "Send an invitation to ada",
        criteria: [{ kind: "text_visible" as const, text: "Invitation sent" }],
        policy: "ask",
      },
      stream: createMockModel({
        plan: [
          actStep("type", "Recipient", { text: "ada" }),
          actStep("type", "Message", { text: "Hello there" }),
          actStep("click", "Send invitation"),
        ],
      }),
      tools: {
        browser,
        tabId: tab,
        evidence: ledgerEvidence(ledger),
        policy: "ask",
        approve: async () => {
          asked += 1;
          return false;
        },
      },
    });

    assert.equal(asked, 1, "the send needed approval");
    assert.ok(outcome.parked, "declining parks the action");
    assert.equal(outcome.parked?.wake, "human");

    const facts = await browser.facts(tab);
    assert.match(facts.text, /Sends: 0/, "nothing was sent");
  });

  it("uses probe to answer a question the snapshot cannot", async () => {
    const { tab, ledger } = await harness("/once", "g_probe");
    const seen: string[][] = [];

    await runTask({
      card: {
        objective: "Find out which fields are required",
        criteria: [{ kind: "control_exists" as const, name: "Send invitation" }],
      },
      stream: createMockModel({
        plan: [
          { tool: TOOL_OBSERVE },
          { tool: TOOL_PROBE, args: { query: { kind: "form_inventory" } } },
        ],
        onTurn: (info) => seen.push(info.calls),
      }),
      tools: { browser, tabId: tab, evidence: ledgerEvidence(ledger) },
    });

    assert.deepEqual(seen, [[TOOL_OBSERVE], [TOOL_PROBE], [TOOL_DONE]]);
    const probes = (await ledger.read()).filter((event) => event.type === "probe");
    assert.equal(probes.length, 1, "the probe is recorded as evidence");
  });

  it("recovers after a failed action instead of repeating it", async () => {
    const { tab, ledger } = await harness("/dead-click", "g_recover");

    const outcome = await runTask({
      card: {
        objective: "Press the button, then confirm nothing happened",
        criteria: [{ kind: "text_visible" as const, text: "does not change the page" }],
      },
      stream: createMockModel({
        plan: [
          actStep("click", "Do nothing"),
          { tool: TOOL_CHECK, args: { predicate: { kind: "control_exists", name: "Bouncer" } } },
        ],
      }),
      tools: { browser, tabId: tab, evidence: ledgerEvidence(ledger), policy: "auto" },
    });

    assert.equal(outcome.report?.status, "success");
    const failures = (await ledger.read()).filter((event) => event.type === "failure");
    assert.equal(failures.length, 1, "the noop click was recorded as a failure");
    assert.match(failures[0]?.outcome?.detail ?? "", /noop click/);
  });

  it("keeps only one live snapshot in context, and that saves real tokens", async () => {
    const LOOKS = 6;

    async function lookRepeatedly(goalId: string, prune: false | { keepLatest: number }) {
      const { tab, ledger } = await harness("/apply", goalId);
      const snapshotsPerTurn: number[] = [];
      let finalSize = 0;

      await runTask({
        card: {
          objective: "Look at the page several times",
          criteria: [{ kind: "control_exists" as const, name: "Full name" }],
        },
        stream: createMockModel({
          plan: Array.from({ length: LOOKS }, () => ({ tool: TOOL_OBSERVE })),
          onContext: (context) => {
            const live = context.messages.filter(
              (message) =>
                (message as { role?: string }).role === "toolResult" &&
                JSON.stringify((message as { content?: unknown }).content ?? "").includes("controls"),
            ).length;
            snapshotsPerTurn.push(live);
            finalSize = JSON.stringify(context.messages).length;
          },
        }),
        tools: { browser, tabId: tab, evidence: ledgerEvidence(ledger) },
        prune,
      });

      return { snapshotsPerTurn, finalSize };
    }

    const pruned = await lookRepeatedly("g_pruned", { keepLatest: 1 });
    const unpruned = await lookRepeatedly("g_unpruned", false);

    assert.ok(pruned.snapshotsPerTurn.length >= LOOKS, "several turns should have happened");
    assert.ok(
      pruned.snapshotsPerTurn.every((count) => count <= 1),
      `expected at most one live snapshot per turn, saw ${pruned.snapshotsPerTurn.join(",")}`,
    );
    assert.ok(
      Math.max(...unpruned.snapshotsPerTurn) > 1,
      "without pruning, snapshots should pile up — otherwise this test proves nothing",
    );

    // The comparison is the point, measured against what was actually dropped rather
    // than an arbitrary ratio. Each look after the first should stop costing a snapshot.
    // The absolute saving scales with page size: a real page carries far more controls
    // than this fixture, so this is the pessimistic case.
    const snapshotCost = wireText(toWireObservation(await browser.observe())).length;
    const saved = unpruned.finalSize - pruned.finalSize;
    assert.ok(
      saved > snapshotCost * 2,
      `saved ${saved} chars, less than two snapshots (${snapshotCost} each)`,
    );
  });
});
