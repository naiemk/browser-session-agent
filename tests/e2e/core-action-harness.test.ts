import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { act, check } from "../../src/core/act.ts";
import { CoreError } from "../../src/core/types.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

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

describe("AGENT-00-T01 action harness", () => {
  it("rejects a click that changes nothing", async () => {
    const tab = await browser.openTab(`${origin}/dead-click`);
    const ref = await refFor(tab, "Do nothing");
    const result = await act(browser, { kind: "click", tabId: tab, ref });

    assert.equal(result.ok, false, "a noop click must not be reported as success");
    assert.equal(result.verification.status, "failed");
    assert.match(result.failure?.recovery ?? "", /noop click/);
  });

  it("reads back what it typed, and fails when the page discards it", async () => {
    const applyTab = await browser.openTab(`${origin}/apply`);
    const nameRef = await refFor(applyTab, "Full name");
    const good = await act(browser, {
      kind: "type",
      tabId: applyTab,
      ref: nameRef,
      text: "Ada Lovelace",
    });
    assert.equal(good.ok, true, JSON.stringify(good.verification));

    const deadTab = await browser.openTab(`${origin}/dead-click`);
    const bouncerRef = await refFor(deadTab, "Bouncer");
    const bad = await act(browser, {
      kind: "type",
      tabId: deadTab,
      ref: bouncerRef,
      text: "will be discarded",
    });
    assert.equal(bad.ok, false, "a field that clears itself must fail read-back");
    assert.match(bad.failure?.recovery ?? "", /expected "will be discarded"/);
  });

  it("selects an option and verifies it stuck", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const ref = await refFor(tab, "Location");
    const result = await act(browser, { kind: "select", tabId: tab, ref, value: "nyc" });
    assert.equal(result.ok, true, JSON.stringify(result.verification));
  });

  it("verifies navigation reached the intended page", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const result = await act(browser, {
      kind: "navigate",
      tabId: tab,
      url: `${origin}/dialog`,
    });
    assert.equal(result.ok, true, JSON.stringify(result.verification));
    assert.equal(result.observation.url, `${origin}/dialog`);
    assert.equal(result.reversibility, "navigational");
  });

  it("drives the combobox: opening changes the page, choosing commits", async () => {
    const tab = await browser.openTab(`${origin}/combobox?mode=united-states-first`);
    const comboRef = await refFor(tab, "Country");

    const opened = await act(browser, { kind: "click", tabId: tab, ref: comboRef });
    assert.equal(opened.ok, true, "opening the list is a real page change");
    assert.ok(
      opened.observation.controls.some((control) => control.role === "option"),
      "options must appear after opening",
    );

    const optionRef = await refFor(tab, "United States");
    const chosen = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: optionRef,
      expect: { kind: "text_visible", text: "United States" },
    });
    assert.equal(chosen.ok, true, JSON.stringify(chosen.verification));

    const committed = await check(browser, { kind: "value_includes", name: "Country", text: "United States" }, tab);
    assert.equal(committed.status, "passed", JSON.stringify(committed.checks));
  });

  it("honours an explicit expectation over the default postcondition", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const ref = await refFor(tab, "Full name");
    const result = await act(browser, {
      kind: "type",
      tabId: tab,
      ref,
      text: "Ada",
      expect: { kind: "text_visible", text: "definitely not on this page" },
    });
    assert.equal(result.ok, false, "an explicit expectation must be able to fail a working action");
    assert.match(result.failure?.recovery ?? "", /definitely not on this page/);
  });

  it("refuses an unknown ref instead of guessing", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    await assert.rejects(
      () => act(browser, { kind: "click", tabId: tab, ref: "e999" }),
      (err: unknown) => err instanceof CoreError && err.code === "missing_ref",
    );
  });

  it("classifies a form submit conservatively", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const nameRef = await refFor(tab, "Full name");
    await act(browser, { kind: "type", tabId: tab, ref: nameRef, text: "Ada" });
    const emailRef = await refFor(tab, "Email");
    await act(browser, { kind: "type", tabId: tab, ref: emailRef, text: "ada@example.com" });

    const submitRef = await refFor(tab, "Submit application");
    const result = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: submitRef,
      expect: { kind: "text_visible", text: "Ada" },
    });
    assert.equal(result.reversibility, "committing");
    assert.match(result.reversibilityReason, /submits a form/);
    assert.equal(result.ok, true, JSON.stringify(result.verification));
  });
});
