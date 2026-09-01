import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
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

describe("V1-02-T01 happy-path pair", () => {
  it("pairs with a one-time code and shows Connected without BSA_TOKEN", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie, account } = await register(world.origin, user.email, user.password);
    const code = await issuePairCode(world.origin, cookie);
    const { deviceToken } = await exchangePair(world.origin, code);
    assert.match(deviceToken, /^dt_/);
    assert.equal(process.env.BSA_TOKEN, undefined);

    const chat = await chatClient(world.api.port, cookie);
    try {
      connectHelper(world, deviceToken);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
      assert.equal(world.api.registry.hubFor(account.id).connected, true);
    } finally {
      chat.close();
    }
  });
});
