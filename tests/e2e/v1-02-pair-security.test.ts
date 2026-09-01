import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AgentError } from "../../src/domain/types.ts";
import { NodeAgent } from "../../src/hosts/node-agent/client.ts";
import {
  authHeaders,
  chatClient,
  closeV1,
  connectHelper,
  exchangePair,
  issuePairCode,
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

describe("V1-02-T03 pairing security", () => {
  it("rejects expired codes, foreign accounts, revoked devices, and empty stores", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const other = await uniqueUser();
    const a = await register(world.origin, user.email, user.password);
    const b = await register(world.origin, other.email, other.password);

    const expired = await issuePairCode(world.origin, a.cookie, 1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const expiredRes = await fetch(`${world.origin}/pair/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: expired }),
    });
    assert.equal(expiredRes.status, 410);

    const code = await issuePairCode(world.origin, a.cookie);
    const foreign = await fetch(`${world.origin}/pair/exchange`, {
      method: "POST",
      headers: authHeaders(b.cookie),
      body: JSON.stringify({ code }),
    });
    assert.equal(foreign.status, 403);

    const { deviceToken, deviceId } = await exchangePair(world.origin, code);
    const chat = await chatClient(world.api.port, a.cookie);
    try {
      connectHelper(world, deviceToken);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);

      const revoked = await fetch(`${world.origin}/devices/${deviceId}/revoke`, {
        method: "POST",
        headers: authHeaders(a.cookie),
      });
      assert.equal(revoked.status, 200);
      await world.node?.close();
      world.node = undefined;
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && !m.connected);

      const rejected = new NodeAgent({
        apiUrl: `ws://127.0.0.1:${world.api.port}/node`,
        deviceToken,
        home: world.home,
        headless: true,
        reconnectMs: 60_000,
      });
      rejected.start();
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(world.api.registry.hubFor(a.account.id).connected, false);
      await rejected.close();

      const empty = new NodeAgent({
        apiUrl: `ws://127.0.0.1:${world.api.port}/node`,
        home: world.home,
        headless: true,
        reconnectMs: 60_000,
      });
      empty.start();
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(world.api.registry.hubFor(a.account.id).connected, false);
      await empty.close();

      await assert.rejects(
        () => world.api.registry.hubFor(a.account.id).call("inspect", []),
        (err: unknown) => err instanceof AgentError && err.code === "helper_disconnected",
      );
    } finally {
      chat.close();
    }
  });
});
