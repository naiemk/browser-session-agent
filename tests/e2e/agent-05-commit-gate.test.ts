import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { loadCheckpoint, restoreCheckpoint, saveCheckpoint } from "../../src/core/checkpoint.ts";
import { guardedAct, type ApprovalRequest } from "../../src/core/gate.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "gate-"));
});

after(async () => {
  await browser?.close();
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

async function refFor(tab: string, name: string): Promise<string> {
  const observation = await browser.observe(tab);
  const control = observation.controls.find((candidate) => candidate.name.includes(name));
  assert.ok(control, `no control named ${name}`);
  return control.ref;
}

/** Open /once and fill it, leaving the one-shot send button untouched. */
async function readyToSend(): Promise<string> {
  const tab = await browser.openTab(`${origin}/once`);
  await guardedAct(browser, {
    kind: "type",
    tabId: tab,
    ref: await refFor(tab, "Recipient"),
    text: "ada",
  });
  await guardedAct(browser, {
    kind: "type",
    tabId: tab,
    ref: await refFor(tab, "Message"),
    text: "Hello there",
  });
  return tab;
}

const FILLED = {
  kind: "all" as const,
  of: [
    { kind: "value_includes" as const, name: "Recipient", text: "ada" },
    { kind: "value_includes" as const, name: "Message", text: "Hello" },
  ],
};

describe("AGENT-05-T02 commit gate", () => {
  it("parks an irreversible action until a human approves", async () => {
    const ledger = await Ledger.open(root, "goal_ask");
    const tab = await readyToSend();
    const asked: ApprovalRequest[] = [];

    const outcome = await guardedAct(
      browser,
      {
        kind: "click",
        tabId: tab,
        ref: await refFor(tab, "Send invitation"),
        intent: "send the invitation",
      },
      {
        policy: "ask",
        precondition: FILLED,
        approve: async (request) => {
          asked.push(request);
          return false;
        },
        ledger,
      },
    );

    assert.equal(outcome.status, "parked");
    if (outcome.status === "parked") {
      assert.equal(outcome.parked.wake, "human");
      assert.equal(outcome.parked.perishable, false);
      assert.match(outcome.parked.reason, /waiting for approval/);
    }
    assert.equal(asked.length, 1);
    assert.match(asked[0]!.reason, /submits a form|sending or publishing/);

    // The critical part: nothing was sent.
    const facts = await browser.facts(tab);
    assert.match(facts.text, /Sends: 0/);
    assert.equal(facts.text.includes("Invitation sent"), false);

    const events = await ledger.read();
    assert.equal(events.at(-1)?.type, "parked");
  });

  it("fails closed when the policy forbids irreversible actions", async () => {
    const tab = await readyToSend();
    const outcome = await guardedAct(
      browser,
      { kind: "click", tabId: tab, ref: await refFor(tab, "Send invitation") },
      { policy: "never", precondition: FILLED },
    );

    assert.equal(outcome.status, "refused");
    if (outcome.status === "refused") assert.equal(outcome.code, "policy_forbids_commit");
    assert.match((await browser.facts(tab)).text, /Sends: 0/);
  });

  it("refuses without acting when the precondition does not hold", async () => {
    const tab = await browser.openTab(`${origin}/once`);
    let asked = 0;

    const outcome = await guardedAct(
      browser,
      { kind: "click", tabId: tab, ref: await refFor(tab, "Send invitation") },
      {
        policy: "ask",
        precondition: FILLED,
        approve: async () => {
          asked += 1;
          return true;
        },
      },
    );

    assert.equal(outcome.status, "refused");
    if (outcome.status === "refused") assert.equal(outcome.code, "precondition_failed");
    assert.equal(asked, 0, "an unmet precondition is not a question for the human");
    assert.match((await browser.facts(tab)).text, /Sends: 0/);
  });

  it("commits once under auto, with evidence on both sides", async () => {
    const ledger = await Ledger.open(root, "goal_auto");
    const tab = await readyToSend();

    const outcome = await guardedAct(
      browser,
      {
        kind: "click",
        tabId: tab,
        ref: await refFor(tab, "Send invitation"),
        intent: "send the invitation",
        expect: { kind: "text_visible", text: "Invitation sent to ada" },
      },
      { policy: "auto", precondition: FILLED, ledger, screenshotDir: ledger.artifactsDir },
    );

    assert.equal(outcome.status, "acted");
    if (outcome.status === "acted") {
      assert.equal(outcome.result.ok, true, JSON.stringify(outcome.result.verification));
      assert.equal(outcome.result.reversibility, "committing");
      assert.equal(outcome.preconditionMet, true);
    }

    const facts = await browser.facts(tab);
    assert.match(facts.text, /Sends: 1/);
    assert.equal(facts.text.includes("Duplicate send detected"), false);

    const approval = (await ledger.read()).find((event) => event.type === "approval");
    assert.ok(approval, "the commit is recorded as an approval event");
    assert.equal(approval.artifacts?.length, 2, "before and after evidence");
    for (const artifact of approval.artifacts ?? []) {
      const file = await stat(artifact);
      assert.ok(file.size > 0, `${artifact} should exist`);
    }
    assert.equal((approval.payload as { preconditionMet: boolean }).preconditionMet, true);
  });

  it("lets reversible work through without asking", async () => {
    const tab = await browser.openTab(`${origin}/list`);
    let asked = 0;
    const outcome = await guardedAct(
      browser,
      { kind: "click", tabId: tab, ref: await refFor(tab, "Next page") },
      { policy: "ask", approve: async () => (asked += 1) > 0 },
    );
    assert.equal(outcome.status, "acted");
    assert.equal(asked, 0, "paging is not a decision worth a human's attention");
  });

  it("does not re-ask after the operator approved the same named action", async () => {
    const ledger = await Ledger.open(root, "goal_sticky");
    const asked: string[] = [];
    const options = {
      policy: "ask" as const,
      approve: async (request: ApprovalRequest) => {
        asked.push(request.reason);
        return true;
      },
      ledger,
    };

    const firstTab = await browser.openTab(`${origin}/apply`);
    const first = await guardedAct(
      browser,
      { kind: "click", tabId: firstTab, ref: await refFor(firstTab, "Submit application") },
      options,
    );
    assert.equal(first.status, "acted");
    assert.equal(asked.length, 1);

    const secondTab = await browser.openTab(`${origin}/apply`);
    const second = await guardedAct(
      browser,
      { kind: "click", tabId: secondTab, ref: await refFor(secondTab, "Submit application") },
      options,
    );
    assert.equal(second.status, "acted");
    assert.equal(asked.length, 1, "a second identical click must not park again");
  });

  it("still asks for a different control after a sticky yes", async () => {
    const ledger = await Ledger.open(root, "goal_sticky_other");
    const tab = await browser.openTab(`${origin}/apply`);
    let asked = 0;
    const options = {
      policy: "ask" as const,
      approve: async () => {
        asked += 1;
        return true;
      },
      ledger,
    };

    const submit = await guardedAct(
      browser,
      { kind: "click", tabId: tab, ref: await refFor(tab, "Submit application") },
      options,
    );
    assert.equal(submit.status, "acted");
    assert.equal(asked, 1);

    const tab2 = await browser.openTab(`${origin}/once`);
    await guardedAct(browser, {
      kind: "type",
      tabId: tab2,
      ref: await refFor(tab2, "Recipient"),
      text: "ada",
    });
    await guardedAct(browser, {
      kind: "type",
      tabId: tab2,
      ref: await refFor(tab2, "Message"),
      text: "Hello there",
    });
    const other = await guardedAct(
      browser,
      { kind: "click", tabId: tab2, ref: await refFor(tab2, "Send invitation") },
      options,
    );
    assert.equal(other.status, "acted");
    assert.equal(asked, 2, "a different name is a different decision");
  });

  it("checkpoints before navigation and restores what was typed", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    await guardedAct(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Full name"),
      text: "Ada Lovelace",
    });
    await guardedAct(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Email"),
      text: "ada@example.com",
    });

    await guardedAct(
      browser,
      { kind: "navigate", tabId: tab, url: `${origin}/dialog` },
      { checkpoint: { root, goalId: "goal_nav", tag: "before-nav" } },
    );

    const checkpoint = await loadCheckpoint(root, "goal_nav", "before-nav");
    assert.ok(checkpoint, "navigating away must leave a way back");
    assert.equal(checkpoint.url, `${origin}/apply`);
    assert.equal(checkpoint.values["Full name"], "Ada Lovelace");

    const restored = await restoreCheckpoint(browser, checkpoint, { tabId: tab });
    assert.deepEqual(restored.missing, []);
    // The select carries its default too: it is real state, and restoring it is harmless.
    assert.deepEqual(restored.restored.sort(), ["Email", "Full name", "Location"]);

    const facts = await browser.facts(tab);
    assert.equal(facts.url, `${origin}/apply`);
    const nameControl = facts.observation.controls.find((c) => c.name.includes("Full name"));
    assert.equal(nameControl?.value, "Ada Lovelace", "a retry does not start from an empty form");
  });

  it("saves a checkpoint on demand as well as on navigation", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    await guardedAct(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Full name"),
      text: "Grace Hopper",
    });
    const saved = await saveCheckpoint(browser, {
      root,
      goalId: "goal_manual",
      tag: "manual",
      tabId: tab,
    });
    assert.equal(saved.values["Full name"], "Grace Hopper");
  });
});
