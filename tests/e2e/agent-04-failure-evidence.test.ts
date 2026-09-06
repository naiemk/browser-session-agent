import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { act, MAX_RECOVERY_CHARS } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { Ledger } from "../../src/core/ledger.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await mkdtemp(path.join(os.tmpdir(), "evidence-"));
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

describe("AGENT-04-T01 failure evidence bundle", () => {
  it("gathers recovery note, delta, console, failed requests, and a screenshot", async () => {
    const ledger = await Ledger.open(root, "goal_noisy");
    const tab = await browser.openTab(`${origin}/noisy`);

    // Let the page's own console error and failed request land first.
    await act(browser, { kind: "wait", tabId: tab, wait: { kind: "timeout", timeoutMs: 300 } });

    const result = await act(
      browser,
      {
        kind: "type",
        tabId: tab,
        ref: await refFor(tab, "Nickname"),
        text: "ada",
        intent: "set the nickname",
        expect: { kind: "value_equals", name: "Nickname", text: "definitely-not-ada" },
      },
      { ledger, screenshotDir: ledger.artifactsDir, entityId: "ent_1" },
    );

    assert.equal(result.ok, false);
    const failure = result.failure;
    assert.ok(failure, "a failed action must carry a bundle");

    assert.match(failure.recovery, /value_equals|definitely-not-ada|Nickname/);
    assert.ok(failure.recovery.length <= MAX_RECOVERY_CHARS);
    assert.ok(
      failure.consoleErrors.some((entry) => entry.includes("widget bootstrap failed")),
      JSON.stringify(failure.consoleErrors),
    );
    assert.ok(
      failure.failedRequests.some((entry) => entry.includes("/missing-endpoint")),
      JSON.stringify(failure.failedRequests),
    );
    assert.ok(
      failure.changes.some((change) => change.includes("value changed")),
      JSON.stringify(failure.changes),
    );

    assert.ok(failure.screenshot, "a screenshot reference is part of the bundle");
    const file = await stat(failure.screenshot);
    assert.ok(file.size > 0, "the screenshot must exist at the referenced path");
  });

  it("writes the bundle as a single ledger event with the screenshot as a reference", async () => {
    const ledger = await Ledger.open(root, "goal_single");
    const tab = await browser.openTab(`${origin}/dead-click`);

    await act(
      browser,
      {
        kind: "click",
        tabId: tab,
        ref: await refFor(tab, "Do nothing"),
        intent: "try the button",
      },
      { ledger, screenshotDir: ledger.artifactsDir },
    );

    const events = await ledger.read();
    assert.equal(events.length, 1, "one action, one event");
    const event = events[0]!;
    assert.equal(event.type, "failure");
    assert.equal(event.intent, "try the button");
    assert.equal(event.before?.url, `${origin}/dead-click`);
    assert.equal(event.action?.kind, "click");
    assert.equal(event.outcome?.ok, false);

    const bundle = (event.payload as { failure: { recovery: string; screenshot?: string } }).failure;
    assert.match(bundle.recovery, /noop click/);
    assert.equal(event.artifacts?.length, 1);
    assert.equal(event.artifacts?.[0], bundle.screenshot);
    assert.equal(JSON.stringify(event).includes("base64"), false, "no inline image bytes");
  });

  it("costs nothing on the happy path", async () => {
    const ledger = await Ledger.open(root, "goal_happy");
    const tab = await browser.openTab(`${origin}/noisy`);

    const result = await act(
      browser,
      { kind: "type", tabId: tab, ref: await refFor(tab, "Nickname"), text: "ada" },
      { ledger, screenshotDir: ledger.artifactsDir },
    );

    assert.equal(result.ok, true);
    assert.equal(result.failure, undefined, "a successful action carries no bundle");

    const [event] = await ledger.read();
    assert.equal(event?.type, "action");
    assert.equal(event?.payload, undefined);
    assert.equal(event?.artifacts, undefined);
  });

  it("still completes the task on a page that logs errors", async () => {
    const tab = await browser.openTab(`${origin}/noisy`);
    await act(browser, { kind: "type", tabId: tab, ref: await refFor(tab, "Nickname"), text: "ada" });
    const saved = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: await refFor(tab, "Save"),
      expect: { kind: "text_visible", text: "Saved: ada" },
    });
    assert.equal(saved.ok, true, "console noise is not failure");
  });
});
