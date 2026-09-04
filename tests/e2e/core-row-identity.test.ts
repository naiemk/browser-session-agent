import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { toWireObservation } from "../../src/runtime/wire.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * The bug that made the agent look stupid.
 *
 * Asked to find "Varya" in a list, it could not, and then guessed handles that did not
 * exist. The list really did contain her. What it could see was a row whose anchor read
 * "v_varvar" and nothing else, because perception kept only a control's own text and the
 * display name lived in a sibling. The two halves of one identity never appeared together
 * anywhere the agent could look.
 *
 * Splitting a row across siblings is how lists are built everywhere, so this is a
 * structural fix rather than anything about a particular site.
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

describe("a control carries its row", () => {
  it("puts a display name and a handle within reach of each other", async () => {
    const tab = await browser.openTab(`${origin}/split-rows`);
    const observation = await browser.observe(tab);

    const handle = observation.controls.find((control) => control.name === "v_varvar");
    assert.ok(handle, "the handle is still the control's name");
    assert.match(
      handle.row ?? "",
      /Varya/,
      "and the row carries the display name, which is what a person searches for",
    );
  });

  it("reaches the model, since perception the model cannot see is no use", async () => {
    const tab = await browser.openTab(`${origin}/split-rows`);
    const wire = toWireObservation(await browser.observe(tab));

    const row = wire.controls.find((control) => control.name === "dana")?.row;
    assert.match(row ?? "", /Dana Ivanova/);
  });

  it("says nothing when the name already identifies the thing", async () => {
    // The row costs tokens on every control of every snapshot, so it has to earn them.
    const tab = await browser.openTab(`${origin}/apply`);
    const observation = await browser.observe(tab);

    const withRow = observation.controls.filter((control) => control.row);
    assert.deepEqual(
      withRow.map((control) => control.name),
      [],
      `a form has no list rows, so nothing should carry one: ${JSON.stringify(withRow)}`,
    );
  });

  it("does not repeat a name back as its own row", async () => {
    const tab = await browser.openTab(`${origin}/guests`);
    const observation = await browser.observe(tab);

    for (const control of observation.controls) {
      assert.notEqual(control.row, control.name, `${control.name} carries itself as its row`);
    }
  });

  it("keeps a row short, whatever the page does", async () => {
    const tab = await browser.openTab(`${origin}/split-rows`);
    const observation = await browser.observe(tab);

    for (const control of observation.controls) {
      assert.ok((control.row?.length ?? 0) <= 120, `row too long: ${control.row}`);
    }
  });
});
