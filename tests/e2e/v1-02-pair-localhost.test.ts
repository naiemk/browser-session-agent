import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  authHeaders,
  chatClient,
  closeV1,
  connectHelper,
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

describe("V1-02-T02 localhost fallback", () => {
  it("claims a helper challenge without a bsa:// code", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const other = await uniqueUser();
    const a = await register(world.origin, user.email, user.password);
    const b = await register(world.origin, other.email, other.password);
    const challenge = `ch-${Date.now()}`;

    const prepared = await fetch(`${world.origin}/pair/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge }),
    });
    assert.equal(prepared.status, 200);

    const claimed = await fetch(`${world.origin}/pair/claim`, {
      method: "POST",
      headers: authHeaders(a.cookie),
      body: JSON.stringify({ challenge }),
    });
    assert.equal(claimed.status, 200);

    const stolen = await fetch(`${world.origin}/pair/claim`, {
      method: "POST",
      headers: authHeaders(b.cookie),
      body: JSON.stringify({ challenge }),
    });
    assert.equal(stolen.status, 403);

    const redeemed = await fetch(`${world.origin}/pair/redeem?challenge=${challenge}`);
    assert.equal(redeemed.status, 200);
    const { deviceToken } = (await redeemed.json()) as { deviceToken: string };

    const chat = await chatClient(world.api.port, a.cookie);
    try {
      connectHelper(world, deviceToken);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
    } finally {
      chat.close();
    }
  });
});
