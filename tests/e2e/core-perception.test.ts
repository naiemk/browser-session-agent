import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
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

describe("perception names and identity", () => {
  it("collapses a label that the page concatenated twice", async () => {
    const tab = await browser.openTab(`${origin}/stutter`);
    const observation = await browser.observe(tab);
    const names = observation.controls.map((control) => control.name);
    assert.ok(names.includes("Search"), `Search missing in ${names.join(", ")}`);
    assert.equal(names.includes("SearchSearch"), false);
    assert.ok(names.includes("Messages 1"), `Messages 1 missing in ${names.join(", ")}`);
    assert.ok(names.includes("Home"), `Home missing in ${names.join(", ")}`);
  });
});
