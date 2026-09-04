import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { act } from "../../src/core/act.ts";
import { LocalBrowser } from "../../src/core/browser.ts";
import { peek } from "../../src/core/peek.ts";
import {
  PORT_RPC_METHODS,
  RpcBrowserPort,
  dispatchPortRpc,
  type RpcCaller,
} from "../../src/hosts/shared/port-rpc.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";

/**
 * The agent driving a browser it cannot touch.
 *
 * In the product the agent runs on a server and the browser runs on the operator's
 * desktop. This drives the whole core - `act`, `peek`, probes, perception - through the
 * RPC client and dispatcher, so the split is exercised rather than assumed. The browser
 * here happens to be local, which is exactly the point: nothing in core can tell.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const server = new FixtureServer();
let origin = "";
let real: LocalBrowser;
let remote: RpcBrowserPort;
let calls: string[] = [];

before(async () => {
  origin = await server.start();
  real = await LocalBrowser.launch({ headless: true });

  // A wire that happens to be a function call. Serialized both ways so anything that is
  // not plain data fails here rather than in production.
  const caller: RpcCaller = {
    async call(method, args) {
      calls.push(method);
      const outcome = await dispatchPortRpc(real, method, JSON.parse(JSON.stringify(args)));
      if (!outcome.handled) throw new Error(`no dispatcher for ${method}`);
      return JSON.parse(JSON.stringify(outcome.result ?? null));
    },
  };
  remote = new RpcBrowserPort(caller);
});

after(async () => {
  await real?.close();
  await server.stop();
});

describe("the port over a wire", () => {
  it("acts and verifies with nothing but data crossing", async () => {
    calls = [];
    const tab = await remote.openTab(`${origin}/apply`);
    const observation = await remote.observe(tab);
    const name = observation.controls.find((control) => control.name.includes("Full name"))!;

    const typed = await act(remote, {
      kind: "type",
      tabId: tab,
      ref: name.ref,
      text: "Ada Lovelace",
    });

    assert.equal(typed.ok, true, JSON.stringify(typed.verification));
    assert.equal(typed.verification.checks[0]?.predicate, "readBack");
    assert.ok(calls.includes("port.fill"), `expected a fill call, saw ${calls.join(", ")}`);
  });

  it("still catches a click that changes nothing", async () => {
    const tab = await remote.openTab(`${origin}/dead-click`);
    const observation = await remote.observe(tab);
    const dead = observation.controls.find((control) => control.role === "button");

    if (dead) {
      const result = await act(remote, { kind: "click", tabId: tab, ref: dead.ref });
      assert.equal(result.ok, false, "verification must survive the wire");
    }
  });

  it("probes and surveys remotely", async () => {
    const tab = await remote.openTab(`${origin}/roster`);

    // No limits given, which is the case JSON breaks: an omitted optional argument
    // arrives as null and a default parameter never fires.
    const probed = await remote.probe({ kind: "count", select: "li" }, tab);
    assert.ok((probed.data as { count: number }).count > 0);

    const survey = await remote.survey(tab);
    assert.ok(survey.navigation.length > 0);
  });

  it("peeks remotely without moving the tab it came from", async () => {
    const tab = await remote.openTab(`${origin}/roster`);
    const result = await peek(remote, { url: `${origin}/p/dana`, tabId: tab });

    assert.match(result.observation.title, /Dana/);
    assert.equal(result.origin.unchanged, true);
  });

  it("answers lastObservation without a round trip", async () => {
    const tab = await remote.openTab(`${origin}/apply`);
    await remote.observe(tab);

    calls = [];
    const cached = remote.lastObservation(tab);
    assert.match(cached?.url ?? "", /\/apply$/);
    assert.deepEqual(calls, [], "a read the caller expects to be free must not cross the wire");
  });

  it("leaves the desktop browser open when the agent is done", async () => {
    const tab = await remote.openTab(`${origin}/apply`);
    await remote.close();
    assert.match((await real.observe(tab)).url, /\/apply$/);
  });
});

describe("both sides of the wire stay in step", () => {
  it("dispatches every port method the interface declares", () => {
    const source = readFileSync(path.join(ROOT, "src/core/browser.ts"), "utf8");
    const start = source.indexOf("export interface BrowserPort {");
    const body = source.slice(start, source.indexOf("\n}", start));
    const declared = [...body.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((match) => match[1]!);

    // Local-only by design: one is a cache read, the other releases local bookkeeping.
    const localOnly = new Set(["lastObservation", "close"]);
    const missing = declared.filter(
      (method) => !localOnly.has(method) && !PORT_RPC_METHODS.includes(method as never),
    );

    assert.deepEqual(
      missing,
      [],
      `these port methods have no RPC dispatch, so a remote browser would fail on them: ${missing.join(", ")}`,
    );
  });

  it("declares no method it cannot answer", async () => {
    for (const method of PORT_RPC_METHODS) {
      const outcome = await dispatchPortRpc(real, `port.${method}`, []).catch(() => ({
        handled: true as const,
        result: undefined,
      }));
      assert.equal(outcome.handled, true, `${method} is listed but not dispatched`);
    }
  });

  it("passes anything that is not a port call straight through", async () => {
    const outcome = await dispatchPortRpc(real, "startRun", ["goal"]);
    assert.equal(outcome.handled, false, "the session dispatcher must keep working alongside");
  });
});
