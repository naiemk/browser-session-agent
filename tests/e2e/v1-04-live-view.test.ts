import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  closeV1,
  connectPaidConsumer,
  startV1Api,
  waitFor,
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-04-T01 live view", () => {
  it("streams a JPEG frame after a run starts", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/apply apply`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const frame = await waitFor(chat.inbox, (m) => m.type === "frame" && Boolean(m.jpeg), 15_000);
      assert.ok((frame.jpeg?.length ?? 0) > 20);
    } finally {
      chat.close();
    }
  });
});
