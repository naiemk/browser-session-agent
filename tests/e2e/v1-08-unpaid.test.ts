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
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-08-T01 unpaid gate", () => {
  it("allows chat but refuses browser-start when unpaid", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie } = await register(world.origin, user.email, user.password);
    const code = await issuePairCode(world.origin, cookie);
    const { deviceToken } = await exchangePair(world.origin, code);
    connectHelper(world, deviceToken);

    const chat = await chatClient(world.api.port, cookie);
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
      chat.send({ type: "prompt", text: "hello unpaid" });
      await waitFor(chat.inbox, (m) => m.type === "agentEvent" && String(m.event?.text ?? "").includes("hello unpaid"));

      chat.send({ type: "command", name: "browser-start", args: "apply somewhere" });
      const err = await waitFor(chat.inbox, (m) => m.type === "error" && m.code === "payment_required");
      assert.equal(err.code, "payment_required");
    } finally {
      chat.close();
    }
  });
});
