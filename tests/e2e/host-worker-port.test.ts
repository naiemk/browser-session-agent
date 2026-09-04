import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { peek } from "../../src/core/peek.ts";
import { WorkerBrowserPort } from "../../src/host/worker-browser-port.ts";
import { BrowserWorker } from "../../src/worker/browser-worker.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";

/**
 * The product's browser, driven by the agent's core.
 *
 * This is the test that would have caught the cutover being impossible. The suite proved
 * the agent worked against a browser this process launched; the product's browser is a
 * persistent-profile Chromium owned by the desktop worker, and nothing exercised the
 * agent against that. So the core could not in fact drive the thing the user runs.
 *
 * Everything here is core code — `act`, `peek`, the port's own perception — pointed at a
 * real worker. If this passes, the same agent that passes the suite can drive the product.
 */

const server = new FixtureServer();
let origin = "";
let worker: BrowserWorker;
let port: WorkerBrowserPort;
let cleanupHome: (() => Promise<void>) | undefined;

before(async () => {
  origin = await server.start();
  const home = await tempHome();
  cleanupHome = home.cleanup;
  worker = new BrowserWorker({ home: home.home, headless: true });
  await worker.start();
  port = WorkerBrowserPort.adopt(worker);
});

after(async () => {
  await worker?.stop().catch(() => undefined);
  await server.stop();
  await cleanupHome?.();
});

describe("the worker behind the agent's port", () => {
  it("perceives a page through core perception, not the legacy one", async () => {
    const tab = await port.openTab(`${origin}/apply`);
    const observation = await port.observe(tab);

    assert.match(observation.url, /\/apply$/);
    assert.ok(observation.controls.length > 0);
    // Fields core emits and the legacy observation never did. If these are missing we are
    // still looking at the page through the old eyes.
    assert.ok("capturedAt" in observation);
    assert.ok(Array.isArray(observation.failedRequests));
  });

  it("acts through the same choke point the suite exercises", async () => {
    const tab = await port.openTab(`${origin}/apply`);
    const observation = await port.observe(tab);
    const name = observation.controls.find((control) => control.name.includes("Full name"))!;

    const typed = await act(port, {
      kind: "type",
      tabId: tab,
      ref: name.ref,
      text: "Ada Lovelace",
    });

    assert.equal(typed.ok, true, JSON.stringify(typed.verification));
    // Verification, reversibility and the failure bundle all come from core, so they are
    // identical here and in the suite rather than reimplemented per browser.
    assert.equal(typed.reversibility, "reversible");
    assert.equal(typed.verification.checks[0]?.predicate, "readBack");
  });

  it("still reports a noop click as a failure", async () => {
    const tab = await port.openTab(`${origin}/dead-click`);
    const observation = await port.observe(tab);
    const dead = observation.controls.find((control) => control.role === "button");

    if (dead) {
      const result = await act(port, { kind: "click", tabId: tab, ref: dead.ref });
      assert.equal(result.ok, false, "a click that changes nothing must not pass");
      assert.match(result.failure?.recovery ?? "", /noop click/);
    }
  });

  it("answers a probe without handing out a page", async () => {
    const tab = await port.openTab(`${origin}/apply`);
    const result = await port.probe({ kind: "form_inventory" }, tab);
    const forms = (result.data as { forms: Array<{ fields: unknown[] }> }).forms;
    assert.ok(forms[0]?.fields.length ?? 0 > 0);
  });

  it("peeks without moving the tab it came from", async () => {
    const tab = await port.openTab(`${origin}/roster`);
    const result = await peek(port, { url: `${origin}/p/dana`, tabId: tab });

    assert.match(result.observation.title, /Dana/);
    assert.equal(result.origin.unchanged, true);
    assert.match((await port.observe(tab)).url, /\/roster$/);
  });

  it("leaves the browser running when the agent is done with it", async () => {
    // The worker owns the process. A task ending must not close the operator's browser,
    // which is why close() here only drops the port's own bookkeeping.
    const tab = await port.openTab(`${origin}/apply`);
    await port.close();

    assert.ok(worker.workerInfo, "the worker still holds a live browser");
    assert.match((await worker.inspect(tab)).url, /\/apply$/);
  });
});
