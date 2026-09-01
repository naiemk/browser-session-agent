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

describe("V1-05-T03 chat shows harness actuals", () => {
  it("broadcasts verification on the chat WS for a rejected click", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie, account } = await register(world.origin, user.email, user.password);
    await markPaid(world.origin, cookie);
    const { deviceToken } = await exchangePair(world.origin, await issuePairCode(world.origin, cookie));
    connectHelper(world, deviceToken);
    const chat = await chatClient(world.api.port, cookie);
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected);
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/dead-click dead`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const observation = await world.api.registry.hubFor(account.id).call<{
        controls: Array<{ ref: string; name: string }>;
      }>("inspect", []);
      const ref = observation.controls.find((c) => c.name.toLowerCase().includes("do nothing"))?.ref;
      assert.ok(ref);
      const from = chat.inbox.length;
      await world.api.registry.hubFor(account.id).call("act", [{ action: "click", ref }]);
      const event = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && m.event?.type === "act_result",
        12_000,
        from,
      );
      const result = event.event?.result as { verification?: { status?: string }; recovery?: string };
      assert.equal(result.verification?.status, "failed");
      assert.match(result.recovery ?? "", /noop/i);
    } finally {
      chat.close();
    }
  });
});
