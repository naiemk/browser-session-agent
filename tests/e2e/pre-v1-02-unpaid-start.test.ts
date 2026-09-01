import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  closeV1,
  connectUnpaidConsumer,
  startV1Api,
  waitFor,
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-02-T01 unpaid start-run allowed", () => {
  it("starts a browser run without mark-paid and never returns payment_required", async () => {
    const world = await withFixture(await startV1Api({ requirePaid: false }));
    worlds.push(world);
    const { chat, account } = await connectUnpaidConsumer(world);
    try {
      assert.equal(account.paid, false);
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/apply apply`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      assert.equal(
        chat.inbox.some((m) => m.type === "error" && m.code === "payment_required"),
        false,
      );
    } finally {
      chat.close();
    }
  });
});
