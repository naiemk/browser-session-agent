import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { LocalBrowser } from "../../src/core/browser.ts";
import { leanPerceiver, referencePerceiver } from "../../src/core/perception/index.ts";
import { MAX_WIRE_CONTROLS, toWireObservation } from "../../src/runtime/wire.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

describe("lean perception on pages past the control cap", () => {
  const server = new FixtureServer();
  let origin = "";

  before(async () => {
    origin = await server.start();
  });

  after(async () => {
    await server.stop();
  });

  it("drops the buried page under an open dialog, and keeps the list that is on top", async () => {
    const reference = await LocalBrowser.launch({ headless: true, perceiver: referencePerceiver });
    const lean = await LocalBrowser.launch({ headless: true, perceiver: leanPerceiver });
    try {
      const refTab = await reference.openTab(`${origin}/modal-list`);
      const leanTab = await lean.openTab(`${origin}/modal-list`);
      const before = await reference.observe(refTab);
      const after = await lean.observe(leanTab);

      const refNames = new Set(before.controls.map((control) => control.name));
      const leanNames = new Set(after.controls.map((control) => control.name));

      assert.ok(refNames.has("Home"), "the reference still lists the buried nav");
      assert.ok(refNames.has("Post 1"), "and the buried posts");
      assert.ok(!leanNames.has("Home"), "lean does not offer a click the backdrop would eat");
      assert.ok(!leanNames.has("Post 1"));
      assert.ok(leanNames.has("follower1"), "the dialog's list is what remains");
      assert.ok((after.perception?.dropped.occlusion ?? 0) > 0);
      // The page is still that large; we just stopped offering the buried half.
      assert.ok((after.totalControls ?? 0) > (after.controls.length));
    } finally {
      await reference.close();
      await lean.close();
    }
  });

  it("puts follower37 on the wire, which the reference cannot", async () => {
    const reference = await LocalBrowser.launch({ headless: true, perceiver: referencePerceiver });
    const lean = await LocalBrowser.launch({ headless: true, perceiver: leanPerceiver });
    try {
      const refWire = toWireObservation(await reference.observe(await reference.openTab(`${origin}/modal-list`)));
      const leanWire = toWireObservation(await lean.observe(await lean.openTab(`${origin}/modal-list`)));

      assert.equal(refWire.controls.length, MAX_WIRE_CONTROLS);
      assert.ok(
        !refWire.controls.some((control) => control.name === "follower37"),
        "posts and chrome spend the wire budget before the list gets that far",
      );
      assert.ok(
        leanWire.controls.some((control) => control.name === "follower37"),
        "once the buried page is dropped, the list fits",
      );
    } finally {
      await reference.close();
      await lean.close();
    }
  });

  it("drops a nested listbox inside a card and keeps the card", async () => {
    const browser = await LocalBrowser.launch({ headless: true, perceiver: leanPerceiver });
    try {
      const observation = await browser.observe(await browser.openTab(`${origin}/nested-cards`));
      const listboxes = observation.controls.filter((control) => control.role === "listbox");
      const cards = observation.controls.filter((control) => /^card\d+$/.test(control.name));
      assert.equal(listboxes.length, 0, "contained listboxes are the children this stage exists to drop");
      assert.ok(cards.length > 0, "the cards themselves stay");
      assert.ok((observation.perception?.dropped.containment ?? 0) > 0);
    } finally {
      await browser.close();
    }
  });

  it("still finds the form on a nav-heavy shell past the cap", async () => {
    const browser = await LocalBrowser.launch({ headless: true, perceiver: referencePerceiver });
    try {
      const observation = await browser.observe(await browser.openTab(`${origin}/nav-shell`));
      assert.ok((observation.totalControls ?? 0) > 80, "the page is past the cap");
      assert.ok(
        observation.controls.some((control) => control.name === "Title"),
        "ranking kept the required field",
      );
      assert.ok(observation.controls.some((control) => control.name === "Save report"));
    } finally {
      await browser.close();
    }
  });
});
