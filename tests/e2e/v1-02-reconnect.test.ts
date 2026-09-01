import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AgentError } from "../../src/domain/types.ts";
import {
  chatClient,
  closeV1,
  issuePairCode,
  register,
  spawnHelper,
  startV1Api,
  stopChild,
  uniqueUser,
  waitFor,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-02-T04 disconnect and reconnect", () => {
  it("fails closed when the helper dies and reconnects with the stored device token", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie, account } = await register(world.origin, user.email, user.password);
    const code = await issuePairCode(world.origin, cookie);
    const chat = await chatClient(world.api.port, cookie);
    let child = spawnHelper(world.api.port, world.home, { BSA_PAIR_CODE: code });
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected, 20_000);
      const afterKill = chat.inbox.length;
      await stopChild(child);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && !m.connected, 12_000, afterKill);

      await assert.rejects(
        () => world.api.registry.hubFor(account.id).call("inspect", []),
        (err: unknown) => err instanceof AgentError && err.code === "helper_disconnected",
      );

      chat.send({ type: "prompt", text: "still here" });
      const event = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && String(m.event?.text ?? "").includes("still here"),
      );
      assert.ok(event);

      const afterRelaunch = chat.inbox.length;
      child = spawnHelper(world.api.port, world.home);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected, 20_000, afterRelaunch);
      assert.equal(world.api.registry.hubFor(account.id).connected, true);
    } finally {
      chat.close();
      await stopChild(child);
    }
  });
});
