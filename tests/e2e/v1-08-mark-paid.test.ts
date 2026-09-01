import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  chatClient,
  closeV1,
  connectHelper,
  exchangePair,
  issuePairCode,
  markPaid,
  register,
  startV1Api,
  uniqueUser,
  waitFor,
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-08-T02 mark paid", () => {
  it("unlocks start-run after mark-paid", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie } = await register(world.origin, user.email, user.password);
    const code = await issuePairCode(world.origin, cookie);
    const { deviceToken } = await exchangePair(world.origin, code);
    connectHelper(world, deviceToken);
    const chat = await chatClient(world.api.port, cookie);
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
      chat.send({ type: "command", name: "browser-start", args: `--url ${world.fixtureOrigin}/apply apply` });
      await waitFor(chat.inbox, (m) => m.type === "error" && m.code === "payment_required");

      await markPaid(world.origin, cookie);
      const paidAgain = await markPaid(world.origin, cookie).then(() => true);
      assert.equal(paidAgain, true);

      const from = chat.inbox.length;
      chat.send({ type: "command", name: "browser-start", args: `--url ${world.fixtureOrigin}/apply apply` });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000, from);
    } finally {
      chat.close();
    }
  });
});
