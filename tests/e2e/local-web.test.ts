import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import WebSocket from "ws";
import { startLocalWeb, type LocalWebHandle } from "../../src/hosts/local-web/launch.ts";
import type { ChatServerMessage } from "../../src/hosts/shared/protocol.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";

const worlds: Array<{ web?: LocalWebHandle; fixture?: FixtureServer; cleanup?: () => Promise<void> }> = [];

afterEach(async () => {
  while (worlds.length) {
    const world = worlds.pop()!;
    await world.web?.close().catch(() => undefined);
    await world.fixture?.stop().catch(() => undefined);
    await world.cleanup?.().catch(() => undefined);
  }
});

async function waitFor(
  inbox: ChatServerMessage[],
  match: (message: ChatServerMessage) => boolean,
  timeoutMs = 8_000,
): Promise<ChatServerMessage> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = inbox.find(match);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for chat message. Saw: ${inbox.map((m) => m.type).join(", ")}`);
}

describe("local web stack", () => {
  it("serves the chat UI and drives a local Chromium without the VPS", async () => {
    process.env.BSA_NO_PI = "1";
    const { home, cleanup } = await tempHome();
    const fixture = new FixtureServer();
    const fixtureOrigin = await fixture.start();
    const web = await startLocalWeb({
      host: "127.0.0.1",
      port: 0,
      token: "dev",
      home,
      headless: true,
    });
    worlds.push({ web, fixture, cleanup });

    const page = await fetch(`${web.origin}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Pair this computer|composer|browser-start/i);

    const health = (await (await fetch(`${web.origin}/healthz`)).json()) as {
      ok: boolean;
      nodeConnected: boolean;
    };
    assert.equal(health.ok, true);
    assert.equal(health.nodeConnected, true);

    const ws = new WebSocket(`ws://127.0.0.1:${web.api.port}/chat`);
    const inbox: ChatServerMessage[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (raw) => inbox.push(JSON.parse(String(raw)) as ChatServerMessage));
    ws.send(JSON.stringify({ type: "hello", token: "dev" }));
    await waitFor(inbox, (m) => m.type === "hello_ok");
    await waitFor(inbox, (m) => m.type === "nodeStatus" && m.connected === true);

    ws.send(JSON.stringify({ type: "command", name: "browser-start", args: `--url ${fixtureOrigin}/apply Apply` }));
    const started = await waitFor(
      inbox,
      (m) => m.type === "notify" && String(m.message ?? "").includes("Started "),
      15_000,
    );
    assert.match(String(started.message), /Started /);
    const observation = await web.api.hub.call<{ url: string }>("inspect", []);
    assert.match(observation.url, /\/apply/);

    ws.close();
  });
});
