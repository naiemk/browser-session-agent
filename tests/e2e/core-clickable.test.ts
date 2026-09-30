import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { MAX_WIRE_CONTROLS, toWireObservation } from "../../src/runtime/wire.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * Clickable means a person could click it. The harness commits a unique type-opened
 * match in the same act. Nothing here is a site, a class name, or a coordinate.
 */
describe("clickable controls and unique chooser commit", () => {
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

  const field = async (tab: string, name: string) => {
    const observation = await browser.observe(tab);
    const found = observation.controls.find((control) => control.name === name);
    assert.ok(found, `missing ${name}`);
    return found;
  };

  it("commits the one pointer row before the list unmounts", async () => {
    const tab = await browser.openTab(`${origin}/chooser?mode=unique`);
    const city = await field(tab, "City");
    const result = await act(browser, {
      kind: "type",
      tabId: tab,
      ref: city.ref,
      text: "Tbilisi",
      intent: "pick the only match",
    });
    assert.equal(result.ok, true, result.failure?.recovery);
    const text = (await browser.facts(tab)).text;
    assert.match(text, /Committed: Tbilisi TBS/);
  });

  it("leaves two matching rows for a later click", async () => {
    const tab = await browser.openTab(`${origin}/chooser?mode=ambiguous`);
    const city = await field(tab, "City");
    const result = await act(browser, {
      kind: "type",
      tabId: tab,
      ref: city.ref,
      text: "United States",
      intent: "filter",
    });
    assert.equal(result.ok, true, result.failure?.recovery);
    const names = result.observation.controls.map((control) => control.name);
    assert.ok(names.includes("United States"));
    assert.ok(names.includes("United States of America"));
    assert.doesNotMatch((await browser.facts(tab)).text, /Committed: United States/);

    const exact = result.observation.controls.find((control) => control.name === "United States");
    assert.ok(exact);
    const picked = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: exact.ref,
      intent: "pick the exact row",
    });
    assert.equal(picked.ok, true, picked.failure?.recovery);
    assert.match((await browser.facts(tab)).text, /Committed: United States$/m);
  });

  it("keeps a just-opened day grid ahead of the nav on the wire", async () => {
    const tab = await browser.openTab(`${origin}/day-grid`);
    const when = await field(tab, "When");
    await act(browser, { kind: "click", tabId: tab, ref: when.ref, intent: "open the grid" });
    const wire = toWireObservation(await browser.observe(tab));
    assert.ok(wire.controls.length <= MAX_WIRE_CONTROLS);
    assert.ok(wire.controls.some((control) => control.name === "10"));
    assert.ok(wire.controls.filter((control) => control.name.startsWith("Nav ")).length < 20);
  });

  it("gives an icon with no button a ref and clicks it", async () => {
    const tab = await browser.openTab(`${origin}/icon-click`);
    const icon = await field(tab, "Open search");
    assert.equal(icon.role, "clickable");
    const result = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: icon.ref,
      intent: "open search",
    });
    assert.equal(result.ok, true, result.failure?.recovery);
    assert.equal(result.observation.title, "Opened");
  });

  it("still offers real links and does not stamp the text inside them", async () => {
    const tab = await browser.openTab(`${origin}/guests`);
    const observation = await browser.observe(tab);
    const names = observation.controls.map((control) => control.name);
    assert.ok(names.includes("Boris Petrov"));
    assert.equal(names.filter((name) => name === "Boris Petrov").length, 1);
  });
});
