import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { BrowserSession } from "../../src/session.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";

const worlds: Array<{
  session: BrowserSession;
  server: FixtureServer;
  cleanup: () => Promise<void>;
}> = [];

afterEach(async () => {
  while (worlds.length) {
    const world = worlds.pop()!;
    await world.session.worker.stop().catch(() => undefined);
    await world.server.stop().catch(() => undefined);
    await world.cleanup().catch(() => undefined);
  }
});

function refNamed(observation: { controls: Array<{ ref: string; name: string }> }, needle: string): string {
  const found = observation.controls.find((c) => c.name.toLowerCase().includes(needle.toLowerCase()));
  if (!found) throw new Error(`no ${needle} in ${observation.controls.map((c) => c.name).join(", ")}`);
  return found.ref;
}

describe("V1-05-T02 read-back for type and select", () => {
  it("accepts matching type/select/navigate and rejects a fill that does not stick", async () => {
    const { home, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    const session = new BrowserSession({ home, headless: true });
    worlds.push({ session, server, cleanup });

    await session.startRun("form", `${origin}/apply`);
    let page = await session.inspect();
    const typed = await session.act({
      action: "type",
      ref: refNamed(page, "full name"),
      text: "Ada Lovelace",
    });
    assert.equal(typed.verification.status, "passed");

    const selected = await session.act({
      action: "select",
      ref: refNamed(typed.observation, "location"),
      value: "nyc",
    });
    assert.equal(selected.verification.status, "passed");

    const moved = await session.act({ action: "navigate", url: `${origin}/login` });
    assert.equal(moved.verification.status, "passed");

    const bounced = await session.act({ action: "navigate", url: `${origin}/dead-click` });
    assert.equal(bounced.verification.status, "passed");
    const stuck = await session.act({
      action: "type",
      ref: refNamed(bounced.observation, "bouncer"),
      text: "should-not-stick",
    });
    assert.equal(stuck.verification.status, "failed");

    const wrongHost = await session.act({
      action: "navigate",
      url: `${origin}/login`,
      expect: { urlIncludes: "other.test" },
    });
    assert.equal(wrongHost.verification.status, "failed");
  });
});
