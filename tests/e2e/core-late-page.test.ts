import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { act, check } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * The race, and the fix.
 *
 * Every effect on /late lands `DELAY_MS` after the click. Judged on the first read, all
 * of them are failures; judged after the page has been given a moment, all of them are
 * the successes they always were. Each test asserts both halves, because a settle window
 * that is never exercised is indistinguishable from one that is not needed — the
 * `settleMs: 0` case is what keeps this test honest.
 *
 * The delay is chosen rather than assumed: comfortably longer than one read, so the
 * impatient half reliably misses, and comfortably inside the default budget, so the
 * settled half reliably catches it.
 */

const DELAY_MS = 900;
const LATE = `/late?delay=${DELAY_MS}`;

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await server.stop();
});

async function refFor(tab: string, name: string): Promise<string> {
  const observation = await browser.observe(tab);
  const control = observation.controls.find((candidate) => candidate.name.includes(name));
  assert.ok(control, `no control named ${name} in ${JSON.stringify(observation.controls)}`);
  return control.ref;
}

describe("a page that answers late", () => {
  it("waits for a dialog that opens after the click, instead of calling it a failure", async () => {
    const tab = await browser.openTab(`${origin}${LATE}`);
    const ref = await refFor(tab, "Open confirmation");

    const impatient = await act(
      browser,
      { kind: "click", tabId: tab, ref, expect: { kind: "dialog_open", open: true } },
      { settleMs: 0 },
    );
    assert.equal(impatient.ok, false, "without a settle window this is the false failure");

    const reloaded = await browser.openTab(`${origin}${LATE}`);
    const result = await act(browser, {
      kind: "click",
      tabId: reloaded,
      ref: await refFor(reloaded, "Open confirmation"),
      expect: { kind: "dialog_open", open: true },
    });

    assert.equal(result.ok, true, JSON.stringify(result.verification));
    assert.ok((result.verification.waitedMs ?? 0) > 0, "it should have had to wait");
    assert.ok((result.verification.samples ?? 0) > 1, "and looked more than once");
  });

  it("waits for a dialog that closes after the click", async () => {
    const tab = await browser.openTab(`${origin}${LATE}`);
    await act(browser, {
      kind: "click",
      tabId: tab,
      ref: await refFor(tab, "Open confirmation"),
      expect: { kind: "dialog_open", open: true },
    });

    const dismissed = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: await refFor(tab, "Dismiss"),
      expect: { kind: "dialog_open", open: false },
    });

    assert.equal(dismissed.ok, true, JSON.stringify(dismissed.verification));
  });

  it("waits for a late render before declaring a click a noop", async () => {
    const tab = await browser.openTab(`${origin}${LATE}`);
    const ref = await refFor(tab, "Load details");

    const result = await act(browser, { kind: "click", tabId: tab, ref });

    assert.equal(result.ok, true, JSON.stringify(result.verification));
    assert.deepEqual(
      result.observation.changes,
      ['added button "Continue"'],
      "the delta must be measured from before the click, not between two polls",
    );
  });

  it("still fails a click that really does nothing, and says the failure survived the wait", async () => {
    const tab = await browser.openTab(`${origin}${LATE}`);
    const ref = await refFor(tab, "Do nothing");

    const result = await act(browser, { kind: "click", tabId: tab, ref });

    assert.equal(result.ok, false, "waiting must not turn a dead click into a success");
    assert.match(result.failure?.recovery ?? "", /noop click/);
    assert.match(result.failure?.recovery ?? "", /still failing 1500ms after the action/);
  });

  it("does not make a verdict that already holds pay for the settle window", async () => {
    const tab = await browser.openTab(`${origin}${LATE}`);

    const result = await act(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Notes"),
      text: "call Dana tomorrow",
    });

    assert.equal(result.ok, true, JSON.stringify(result.verification));
    assert.equal(result.verification.waitedMs, 0, "a value read back is answered first time");
    assert.equal(result.verification.samples, 1, "and costs exactly one read");
  });

  it("settles a standalone check for the same reason", async () => {
    const tab = await browser.openTab(`${origin}${LATE}`);
    await act(
      browser,
      { kind: "click", tabId: tab, ref: await refFor(tab, "Load details") },
      { settleMs: 0 },
    );

    const impatient = await check(browser, { kind: "text_visible", text: "Continue" }, tab, 0);
    const settled = await check(browser, { kind: "text_visible", text: "Continue" }, tab);

    assert.equal(impatient.status, "failed");
    assert.equal(settled.status, "passed", JSON.stringify(settled.checks));
  });
});
