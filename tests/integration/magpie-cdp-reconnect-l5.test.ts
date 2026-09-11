/**
 * CAMPAIGN-R2-E1 / R2.E1 — L5 Magpie CDP reconnect after control-client drop.
 *
 * Non-evidence: cookie restore after worker.stop() (browser-loop), same-process
 * port retention. This test: disconnect() leaves Chromium, a second BrowserWorker
 * attaches via worker.json, auth survives, stale ref/tab fail closed.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { CoreError } from "../../src/core/types.ts";
import { WorkerBrowserPort } from "../../src/host/worker-browser-port.ts";
import { readWorkerInfo } from "../../src/store/worker-info.ts";
import { BrowserWorker } from "../../src/worker/browser-worker.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";

function refNamed(
  observation: { controls: Array<{ ref: string; name: string; inputType?: string }> },
  needle: string,
): string {
  const compact = needle.toLowerCase().replace(/\s+/g, "");
  const found = observation.controls.find((c) => {
    const name = c.name.toLowerCase().replace(/\s+/g, "");
    return name.includes(compact) || c.inputType?.toLowerCase() === needle.toLowerCase();
  });
  if (!found) {
    throw new Error(
      `No control matching ${needle}: ${observation.controls.map((c) => c.name).join(", ")}`,
    );
  }
  return found.ref;
}

describe("CAMPAIGN-R2-E1 Magpie CDP reconnect (L5)", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      await cleanups.pop()!().catch(() => undefined);
    }
  });

  it("reconnects a new WorkerBrowserPort after disconnect and keeps fixture auth", async () => {
    const { home, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    const workerA = new BrowserWorker({ home, headless: true });
    let workerB: BrowserWorker | undefined;

    cleanups.push(async () => {
      await workerB?.stop().catch(() => undefined);
      await workerA.stop().catch(() => undefined);
      await server.stop().catch(() => undefined);
      await cleanup();
    });

    await workerA.start();
    const portA = WorkerBrowserPort.adopt(workerA);
    const tabA = await portA.openTab(`${origin}/login`);

    const login = await portA.observe(tabA);
    await act(portA, {
      kind: "type",
      tabId: tabA,
      ref: refNamed(login, "email"),
      text: "ada@example.com",
    });
    const afterEmail = await portA.observe(tabA);
    await act(portA, {
      kind: "type",
      tabId: tabA,
      ref: refNamed(afterEmail, "password"),
      text: "secret",
    });
    const afterPassword = await portA.observe(tabA);
    const signedIn = await act(portA, {
      kind: "click",
      tabId: tabA,
      ref: refNamed(afterPassword, "sign in"),
    });
    assert.equal(signedIn.ok, true, JSON.stringify(signedIn.verification));
    assert.match((await portA.observe(tabA)).url, /\/jobs/);

    const preReconnectRef = (await portA.observe(tabA)).controls[0]?.ref ?? "e1";
    const infoBefore = await readWorkerInfo(home);
    assert.ok(infoBefore?.cdpUrl);
    const cdpUrl = infoBefore.cdpUrl;

    await workerA.disconnect();

    // disconnect ≠ stop: Chromium + worker.json still live
    const infoAfterDisconnect = await readWorkerInfo(home);
    assert.ok(infoAfterDisconnect?.cdpUrl);
    assert.equal(infoAfterDisconnect.cdpUrl, cdpUrl);
    const version = await fetch(`${cdpUrl}/json/version`);
    assert.equal(version.ok, true, "CDP must answer after disconnect");
    try {
      process.kill(infoAfterDisconnect.pid, 0);
    } catch {
      assert.fail(`Chrome pid ${infoAfterDisconnect.pid} died on disconnect`);
    }

    workerB = new BrowserWorker({ home, headless: true });
    const infoB = await workerB.start();
    assert.equal(infoB.cdpUrl, cdpUrl, "second worker must reuse CDP, not relaunch");

    const portB = WorkerBrowserPort.adopt(workerB);
    assert.notEqual(portB, portA);

    const tabB = workerB.firstTabId();
    assert.ok(tabB);
    await portB.navigate(tabB, `${origin}/jobs`, 15_000);
    const jobs = await portB.observe(tabB);
    assert.match(jobs.url, /\/jobs/, "fixture auth must survive CDP reconnect");
    assert.doesNotMatch(jobs.url, /\/login/);

    // Stale pre-reconnect ref fails closed (new observation has fresh refs).
    await assert.rejects(
      () =>
        act(portB, {
          kind: "click",
          tabId: tabB,
          ref: "e999_stale_pre_reconnect",
        }),
      (err: unknown) => {
        assert.ok(err instanceof CoreError);
        assert.equal(err.code, "missing_ref");
        return true;
      },
    );
    // Also reject a ref that looked real on portA if it is absent after reconnect observe.
    if (!jobs.controls.some((c) => c.ref === preReconnectRef)) {
      await assert.rejects(
        () => act(portB, { kind: "click", tabId: tabB, ref: preReconnectRef }),
        (err: unknown) => err instanceof CoreError && err.code === "missing_ref",
      );
    }

    assert.throws(
      () => portB.pageFor("tab_dead_unknown"),
      (err: unknown) => {
        assert.ok(err instanceof CoreError);
        assert.equal(err.code, "missing_tab");
        return true;
      },
    );
  });
});
