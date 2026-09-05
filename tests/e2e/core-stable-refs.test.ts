import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * A ref belongs to an element for as long as the element lasts.
 *
 * The property matters twice. A ref the model read a turn ago has to still address the
 * same thing, or a list that grows at the top quietly redirects every action. And a
 * snapshot cannot describe itself as a change from the last one unless the controls it
 * leaves out are still addressable.
 */
describe("refs survive the page changing under them", () => {
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

  const refFor = async (tab: string, name: string) => {
    const observation = await browser.observe(tab);
    return observation.controls.find((control) => control.name.includes(name));
  };

  it("keeps a row's ref when a new row arrives above it", async () => {
    const tab = await browser.openTab(`${origin}/prepend`);
    const before = await refFor(tab, "First message");
    assert.ok(before);

    const arrive = await refFor(tab, "Receive one");
    await act(browser, { kind: "click", tabId: tab, ref: arrive!.ref, intent: "receive one" });

    const after = await refFor(tab, "First message");
    assert.equal(after?.ref, before.ref, "the row the model was holding must not move");
  });

  it("numbers a new control above every ref the page is already carrying", async () => {
    const tab = await browser.openTab(`${origin}/prepend`);
    const first = await browser.observe(tab);
    const taken = new Set(first.controls.map((control) => control.ref));

    const arrive = first.controls.find((control) => control.name.includes("Receive one"))!;
    await act(browser, { kind: "click", tabId: tab, ref: arrive.ref, intent: "receive one" });

    const second = await browser.observe(tab);
    const arrival = second.controls.find((control) => control.name === "Arrival 1");
    assert.ok(arrival, "the new row must be perceived");
    assert.equal(taken.has(arrival.ref), false, "a fresh ref must not collide with a held one");
  });

  it("still acts on a ref read before the page changed", async () => {
    const tab = await browser.openTab(`${origin}/prepend`);
    const held = await refFor(tab, "Second message");
    const arrive = await refFor(tab, "Receive one");

    await act(browser, { kind: "click", tabId: tab, ref: arrive!.ref, intent: "receive one" });
    await act(browser, { kind: "click", tabId: tab, ref: arrive!.ref, intent: "receive another" });

    // Two arrivals later, the ref from before still points at the row it named.
    const result = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: held!.ref,
      intent: "open the message I chose earlier",
      expect: { kind: "url_includes", text: "/m/2" },
    });
    assert.equal(result.ok, true, result.failure?.recovery);
  });

  it("starts again after navigation, because that is a different page", async () => {
    const tab = await browser.openTab(`${origin}/prepend`);
    await browser.observe(tab);
    await act(browser, { kind: "navigate", tabId: tab, url: `${origin}/prepend`, intent: "reload" });

    const fresh = await browser.observe(tab);
    assert.equal(fresh.controls[0]?.ref, "e1");
  });
});
