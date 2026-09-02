import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  chatClient,
  closeV1,
  register,
  startV1Api,
  uniqueUser,
  waitFor,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE chat hello does not wait for Pi boot", () => {
  it("returns hello_ok while the consumer agent is still starting", async () => {
    const world = await startV1Api({ requirePaid: false, fakePi: true, consumerStartDelayMs: 2500 });
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie } = await register(world.origin, user.email, user.password);
    const started = Date.now();
    const chat = await chatClient(world.api.port, cookie);
    try {
      const helloMs = Date.now() - started;
      assert.ok(helloMs < 1500, `hello_ok took ${helloMs}ms; start must not block chat`);
      const starting = chat.inbox.find(
        (m) => m.type === "notify" && String(m.message ?? "").includes("Starting the agent"),
      );
      assert.ok(starting, JSON.stringify(chat.inbox));
      chat.send({ type: "prompt", text: "hello after start" });
      const queued = await waitFor(chat.inbox, (m) => m.type === "notify" && String(m.message).includes("queued"));
      assert.ok(queued);
      const event = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && String(m.event?.text ?? "").includes("hello after start"),
        8_000,
      );
      assert.match(String(event.event?.text ?? ""), /^Pi:/);
    } finally {
      chat.close();
    }
  });

  it("reuses the same consumer runtime across reconnects", async () => {
    const world = await startV1Api({ requirePaid: false, fakePi: true, consumerStartDelayMs: 400 });
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie } = await register(world.origin, user.email, user.password);
    const first = await chatClient(world.api.port, cookie);
    first.close();
    const second = await chatClient(world.api.port, cookie);
    try {
      second.send({ type: "prompt", text: "after reconnect" });
      const event = await waitFor(
        second.inbox,
        (m) => m.type === "agentEvent" && String(m.event?.text ?? "").includes("after reconnect"),
        8_000,
      );
      assert.match(String(event.event?.text ?? ""), /^Pi:/);
    } finally {
      second.close();
    }
  });
});
