import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true, quietGestures: true });
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

describe("headed Chrome gestures that do not steal OS focus", () => {
  it("clicks and fills through the DOM so CDP mouse/keyboard are not required", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const name = await refFor(tab, "Full name");
    const typed = await act(browser, { kind: "fill", tabId: tab, ref: name, text: "Ada Lovelace" });
    assert.equal(typed.ok, true, JSON.stringify(typed));
    const submit = await refFor(tab, "Submit application");
    const clicked = await act(browser, { kind: "click", tabId: tab, ref: submit });
    assert.equal(clicked.ok, true, JSON.stringify(clicked));
  });
});
