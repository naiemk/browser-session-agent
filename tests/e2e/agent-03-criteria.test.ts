import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { resolveTaskOutcome, stepCheck, TaskStore } from "../../src/core/task.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "criteria-e2e-"));
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

const APPLY_CRITERIA = [{ kind: "text_visible" as const, text: "Thanks Ada Lovelace" }];

describe("AGENT-03 the oracle on a real page", () => {
  it("records a claimed-but-unfinished application as failed", async () => {
    const store = await TaskStore.open(root, "goal_claim");
    const ledger = await Ledger.open(root, "goal_claim");
    const tab = await browser.openTab(`${origin}/apply`);

    const task = await store.create({
      objective: "Apply for the role as Ada Lovelace",
      criteria: APPLY_CRITERIA,
    });

    // The "agent" fills one field, never submits, and reports success anyway.
    await act(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Full name"),
      text: "Ada Lovelace",
    });

    const resolution = await resolveTaskOutcome(store, task.taskId, browser, {
      tabId: tab,
      ledger,
      claim: "Application submitted successfully.",
    });

    assert.equal(resolution.outcome.status, "failed");
    const events = await ledger.read();
    assert.equal(events.at(-1)?.outcome?.ok, false);
  });

  it("passes only once the page actually shows the confirmation", async () => {
    const store = await TaskStore.open(root, "goal_real");
    const tab = await browser.openTab(`${origin}/apply`);
    const task = await store.create({
      objective: "Apply for the role as Ada Lovelace",
      criteria: APPLY_CRITERIA,
    });

    await act(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Full name"),
      text: "Ada Lovelace",
    });
    await act(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Email"),
      text: "ada@example.com",
    });

    const beforeSubmit = await resolveTaskOutcome(store, task.taskId, browser, { tabId: tab });
    assert.equal(beforeSubmit.outcome.status, "failed", "filled is not submitted");

    await act(browser, {
      kind: "click",
      tabId: tab,
      ref: await refFor(tab, "Submit application"),
      expect: { kind: "text_visible", text: "Thanks" },
    });

    const afterSubmit = await resolveTaskOutcome(store, task.taskId, browser, { tabId: tab });
    assert.equal(afterSubmit.outcome.status, "success");
  });

  it("keeps passing step checks from rescuing a failed task", async () => {
    const store = await TaskStore.open(root, "goal_steps");
    const tab = await browser.openTab(`${origin}/apply`);
    const task = await store.create({
      objective: "Apply for the role as Ada Lovelace",
      criteria: APPLY_CRITERIA,
    });

    const onForm = await stepCheck(browser, { kind: "text_visible", text: "Application" }, { tabId: tab });
    const hasSubmit = await stepCheck(
      browser,
      { kind: "control_exists", name: "Submit application" },
      { tabId: tab },
    );
    assert.equal(onForm.status, "passed");
    assert.equal(hasSubmit.status, "passed");

    const resolution = await resolveTaskOutcome(store, task.taskId, browser, { tabId: tab });
    assert.equal(resolution.outcome.status, "failed");
  });
});
