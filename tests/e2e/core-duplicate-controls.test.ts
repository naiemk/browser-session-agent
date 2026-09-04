import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { duplicateKeyCount } from "../../src/core/diff.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * A real page whose rows are told apart only by table cells, which are not controls and
 * so never reach a snapshot. Every interactive element is identically labelled, and that
 * is the shape that used to make a working click look like a noop.
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

describe("acting on one of many identical controls", () => {
  it("reports the click as having done something", async () => {
    const tab = await browser.openTab(`${origin}/rows`);
    const observation = await browser.observe(tab);

    const boxes = observation.controls.filter((control) => control.name === "Select");
    assert.equal(boxes.length, 5, "the fixture has one checkbox per row");
    assert.ok(duplicateKeyCount(observation.controls) >= 5, "and they are indistinguishable");

    // The third row, deliberately not the last: a map keyed on role:name keeps the last
    // one, so any other row was the case that vanished.
    const result = await act(browser, { kind: "click", tabId: tab, ref: boxes[2]!.ref });

    assert.equal(result.ok, true, `click reported as a noop: ${JSON.stringify(result.verification)}`);
    assert.ok(
      result.observation.changes.some((change) => /checked changed/.test(change)),
      `expected the delta to name the change, got ${JSON.stringify(result.observation.changes)}`,
    );
  });

  it("does not invent changes when a click really does nothing", async () => {
    const tab = await browser.openTab(`${origin}/rows`);
    const observation = await browser.observe(tab);
    const disabled = observation.controls.find((control) =>
      control.name.includes("Archive selected"),
    );
    assert.ok(disabled, "the archive button is present but disabled with nothing selected");

    const result = await act(browser, {
      kind: "click",
      tabId: tab,
      ref: disabled.ref,
    }).catch((err: unknown) => err);

    // Either the click is refused or it is reported as a noop; what must not happen is a
    // confident success. A disabled control changes nothing.
    if (result instanceof Error) return;
    const outcome = result as Awaited<ReturnType<typeof act>>;
    assert.equal(outcome.ok, false, "a click on a disabled control is not a success");
  });

  it("counts one change per row when several rows are selected", async () => {
    const tab = await browser.openTab(`${origin}/rows`);
    const first = await browser.observe(tab);
    const boxes = first.controls.filter((control) => control.name === "Select");

    await act(browser, { kind: "click", tabId: tab, ref: boxes[0]!.ref });
    const second = await act(browser, { kind: "click", tabId: tab, ref: boxes[1]!.ref });

    assert.equal(second.ok, true);
    const checkedChanges = second.observation.changes.filter((change) =>
      /checked changed/.test(change),
    );
    assert.equal(checkedChanges.length, 1, JSON.stringify(second.observation.changes));
  });
});
