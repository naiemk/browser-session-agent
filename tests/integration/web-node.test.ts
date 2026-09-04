import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import WebSocket from "ws";
import { act } from "../../src/core/act.ts";
import { peek } from "../../src/core/peek.ts";
import { AgentError } from "../../src/domain/types.ts";
import { RpcBrowserPort } from "../../src/hosts/shared/port-rpc.ts";
import { startOperatorApi, type OperatorApi } from "../../src/hosts/web/server.ts";
import { NodeAgent } from "../../src/hosts/node-agent/client.ts";
import type { ChatServerMessage } from "../../src/hosts/shared/protocol.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";

interface World {
  api?: OperatorApi;
  node?: NodeAgent;
  server?: FixtureServer;
  cleanupHome?: () => Promise<void>;
}

const worlds: World[] = [];

afterEach(async () => {
  while (worlds.length) {
    const world = worlds.pop()!;
    await world.node?.session.worker.stop().catch(() => undefined);
    await world.node?.close().catch(() => undefined);
    await world.api?.close().catch(() => undefined);
    await world.server?.stop().catch(() => undefined);
    await world.cleanupHome?.().catch(() => undefined);
  }
});

async function chatClient(port: number, token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/chat`);
  const inbox: ChatServerMessage[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.on("message", (raw) => {
    inbox.push(JSON.parse(String(raw)) as ChatServerMessage);
  });
  ws.send(JSON.stringify({ type: "hello", token }));
  await waitFor(inbox, (m) => m.type === "hello_ok");
  return {
    ws,
    inbox,
    send(message: object) {
      ws.send(JSON.stringify(message));
    },
    close() {
      ws.close();
    },
  };
}

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

describe("web host + desktop node", () => {
  it("forwards browser commands over WS and fails closed when the node drops", async () => {
    process.env.BSA_NO_PI = "1";
    const { home, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    const api = await startOperatorApi({ host: "127.0.0.1", token: "secret", agentDir: home });
    const node = new NodeAgent({
      apiUrl: `ws://127.0.0.1:${api.port}/node`,
      token: "secret",
      home,
      headless: true,
      reconnectMs: 50,
    });
    node.start();
    const world: World = { api, node, server, cleanupHome: cleanup };
    worlds.push(world);

    const chat = await chatClient(api.port, "secret");
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);

      chat.send({ type: "command", name: "browser-start", args: `--url ${origin}/login Sign in` });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"));

      const observation = await api.hub.call<{ url: string }>("inspect", []);
      assert.match(observation.url, /login/);

      const health = (await fetch(`http://127.0.0.1:${api.port}/healthz`).then((r) => r.json())) as {
        nodeConnected: boolean;
      };
      assert.equal(health.nodeConnected, true);

      await node.close();
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && !m.connected);

      await assert.rejects(
        () => api.hub.call("inspect", []),
        (err: unknown) => err instanceof AgentError && err.code === "node_disconnected",
      );

      chat.send({ type: "takeover_input", event: { kind: "mouse", action: "move", x: 0.5, y: 0.5 } });
      await waitFor(chat.inbox, (m) => m.type === "error" && m.message.includes("awaiting_takeover"));
    } finally {
      chat.close();
    }
  });

  it("allows remote input only during takeover and streams a screencast frame", async () => {
    process.env.BSA_NO_PI = "1";
    const { home, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    const api = await startOperatorApi({ host: "127.0.0.1", token: "secret", agentDir: home });
    const node = new NodeAgent({
      apiUrl: `ws://127.0.0.1:${api.port}/node`,
      token: "secret",
      home,
      headless: true,
    });
    node.start();
    worlds.push({ api, node, server, cleanupHome: cleanup });

    const chat = await chatClient(api.port, "secret");
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
      chat.send({ type: "command", name: "browser-start", args: `--url ${origin}/login Sign in` });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"));
      await waitFor(chat.inbox, (m) => m.type === "frame" && Boolean(m.jpeg), 15_000);

      assert.throws(
        () => api.hub.forwardTakeoverInput({ kind: "mouse", action: "move", x: 0.2, y: 0.2 }),
        /awaiting_takeover/,
      );

      chat.send({ type: "command", name: "browser-takeover", args: "" });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Takeover"));
      api.hub.forwardTakeoverInput({ kind: "mouse", action: "move", x: 0.2, y: 0.2 });
    } finally {
      chat.close();
    }
  });

  it("lets the agent drive the desktop browser over the real wire", async () => {
    // The topology the product actually has: agent on the server, browser on the desktop,
    // a websocket in between. Nothing before this exercised the agent's core against it,
    // which is why the port handing out a live Playwright page went unnoticed for so long.
    process.env.BSA_NO_PI = "1";
    const { home, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    const api = await startOperatorApi({ host: "127.0.0.1", token: "secret", agentDir: home });
    const node = new NodeAgent({
      apiUrl: `ws://127.0.0.1:${api.port}/node`,
      token: "secret",
      home,
      headless: true,
    });
    node.start();
    worlds.push({ api, node, server, cleanupHome: cleanup });

    const chat = await chatClient(api.port, "secret");
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);

      const remote = new RpcBrowserPort({
        call: (method, args) => api.hub.call(method, args as unknown[]),
      });

      const tab = await remote.openTab(`${origin}/apply`);
      const observation = await remote.observe(tab);
      assert.match(observation.url, /\/apply$/);
      assert.ok(observation.controls.length > 0, "core perception, over a websocket");

      // The whole choke point, run from here against a browser in another process.
      const name = observation.controls.find((control) => control.name.includes("Full name"))!;
      const typed = await act(remote, {
        kind: "type",
        tabId: tab,
        ref: name.ref,
        text: "Ada Lovelace",
      });
      assert.equal(typed.ok, true, JSON.stringify(typed.verification));

      // And a read that must not move the tab, which is the point of peeking.
      const peeked = await peek(remote, { url: `${origin}/p/dana`, tabId: tab });
      assert.match(peeked.observation.title, /Dana/);
      assert.equal(peeked.origin.unchanged, true);
      assert.match((await remote.observe(tab)).url, /\/apply$/);
    } finally {
      chat.close();
    }
  });
});
