import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { LocalBrowser } from "../../src/core/browser.ts";
import { MAX_WIRE_CONTROLS, toWireObservation } from "../../src/runtime/wire.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

describe("a page whose furniture outnumbers its content", () => {
  const server = new FixtureServer();
  let origin = "";
  let browser: LocalBrowser;

  before(async () => {
    origin = await server.start();
    browser = await LocalBrowser.launch({ headless: true });
  });

  after(async () => {
    await browser.close();
    await server.stop();
  });

  it("spends the slots on the list, not on the nav and the footer", async () => {
    const tab = await browser.openTab(`${origin}/crowded`);
    const wire = toWireObservation(await browser.observe(tab));

    assert.equal(wire.controls.length, MAX_WIRE_CONTROLS, "the page is over the cap");

    const rows = wire.controls.filter((control) => /^member\d+$/.test(control.name));
    assert.ok(
      rows.length >= MAX_WIRE_CONTROLS - 5,
      `the agent came for the list and saw ${rows.length} of it`,
    );

    // Document order survives the choice, so the list still reads as a list.
    const shown = wire.controls.map((control) => control.name);
    assert.deepEqual(
      [...shown].sort((a, b) => shown.indexOf(a) - shown.indexOf(b)),
      shown,
      "selection reorders nothing",
    );
  });

  it("says how much of the page it is showing, counted against the page", async () => {
    const tab = await browser.openTab(`${origin}/crowded`);
    const wire = toWireObservation(await browser.observe(tab));

    // 8 header + 10 nav + 13 footer + 40 rows, so the honest remainder is far more than
    // the shortfall against an already-capped list.
    assert.match(wire.note ?? "", /of 7\d controls shown/);
  });

  it("names an image link by its alt text rather than by its tag", async () => {
    const tab = await browser.openTab(`${origin}/crowded`);
    const observation = await browser.observe(tab);
    const badge = observation.controls.find((control) => control.href?.includes("/badge"));

    assert.ok(badge, "the image link must be perceived");
    assert.equal(badge.name, "Verified badge");
  });

  it("marks site furniture as furniture, from the document's own landmarks", async () => {
    const tab = await browser.openTab(`${origin}/crowded`);
    const observation = await browser.observe(tab);

    const nav = observation.controls.find((control) => control.name === "Section one");
    const row = observation.controls.find((control) => control.name === "member1");

    assert.equal(nav?.chrome, true);
    assert.equal(row?.chrome, undefined, "a list row is what the page is about");
  });
});
