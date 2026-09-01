import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { BrowserSession } from "../../src/session.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";

interface World {
  session: BrowserSession;
  server: FixtureServer;
  origin: string;
  cleanup: () => Promise<void>;
}

const worlds: World[] = [];

afterEach(async () => {
  while (worlds.length) {
    const world = worlds.pop()!;
    await world.session.worker.stop().catch(() => undefined);
    await world.server.stop().catch(() => undefined);
    await world.cleanup().catch(() => undefined);
  }
});

async function boot(): Promise<World> {
  const { home, cleanup } = await tempHome();
  const server = new FixtureServer();
  const origin = await server.start();
  const session = new BrowserSession({ home, headless: true });
  const world = { session, server, origin, cleanup };
  worlds.push(world);
  return world;
}

function refNamed(observation: { controls: Array<{ ref: string; name: string }> }, needle: string): string {
  const found = observation.controls.find((c) => c.name.toLowerCase().includes(needle.toLowerCase()));
  if (!found) throw new Error(`no ${needle} in ${observation.controls.map((c) => c.name).join(", ")}`);
  return found.ref;
}

describe("V1-05-T01 no-op click is rejected", () => {
  it("rejects a click that does not change the page", async () => {
    const world = await boot();
    await world.session.startRun("noop", `${world.origin}/dead-click`);
    const page = await world.session.inspect();
    const result = await world.session.act({ action: "click", ref: refNamed(page, "do nothing") });
    assert.equal(result.verification.status, "failed");
    assert.match(result.recovery ?? "", /noop/i);
  });
});
