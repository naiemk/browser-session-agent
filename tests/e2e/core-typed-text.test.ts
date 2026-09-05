import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { act, check } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * Text you typed is text on the page.
 *
 * A page's innerText does not contain the value of an input, so asking whether the text
 * just typed is visible used to answer no however well the typing worked. That is a
 * false failure with a real cost — it was one of the failures in the trace that prompted
 * this work — and it is also just wrong about what a person sees.
 */

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

describe("what a field holds counts as visible text", () => {
  it("accepts an expectation naming the text that was just typed", async () => {
    const tab = await browser.openTab(`${origin}/apply`);

    const result = await act(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Full name"),
      text: "Ada Lovelace",
      expect: { kind: "text_visible", text: "Ada Lovelace" },
    });

    assert.equal(result.ok, true, JSON.stringify(result.verification));
  });

  it("keeps text_absent honest about the same value", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    await act(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Full name"),
      text: "Ada Lovelace",
    });

    const absent = await check(browser, { kind: "text_absent", text: "Ada Lovelace" }, tab);
    assert.equal(absent.status, "failed", "a field holding it means it is not absent");

    const other = await check(browser, { kind: "text_absent", text: "Grace Hopper" }, tab);
    assert.equal(other.status, "passed");
  });

  it("does not make a password searchable", async () => {
    const tab = await browser.openTab(`${origin}/login`);

    await act(browser, {
      kind: "type",
      tabId: tab,
      ref: await refFor(tab, "Password"),
      text: "hunter2",
    });

    // Redacted at the source in perception, so it was never in the snapshot to find.
    const leaked = await check(browser, { kind: "text_visible", text: "hunter2" }, tab, 0);
    assert.equal(leaked.status, "failed", "a password must not become findable text");
  });
});
