import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import WebSocket from "ws";
import { chatClient, closeV1, register, startV1Api, uniqueUser, waitFor, type V1World } from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-01-T02 authenticated chat", () => {
  it("opens chat with a session cookie and returns an agentEvent", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie } = await register(world.origin, user.email, user.password);
    const chat = await chatClient(world.api.port, cookie);
    try {
      chat.send({ type: "prompt", text: "hello from v1" });
      const event = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && m.event?.type === "text_delta",
      );
      assert.match(String(event.event?.text ?? ""), /hello from v1/);
    } finally {
      chat.close();
    }
  });

  it("rejects chat without a session", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const ws = new WebSocket(`ws://127.0.0.1:${world.api.port}/chat`);
    const inbox: Array<{ type: string; code?: string }> = [];
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (raw) => inbox.push(JSON.parse(String(raw))));
    const closed = new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)));
    ws.send(JSON.stringify({ type: "hello" }));
    const code = await closed;
    assert.equal(code, 4401);
    assert.ok(inbox.some((m) => m.type === "error"));
    ws.close();
  });
});
