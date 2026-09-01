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

describe("V1-03-T01 start and inspect", () => {
  it("inspects the helper Chromium from a paid paired chat", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat, hub } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/apply apply now`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const observation = await hub.call<{
        url: string;
        title: string;
        controls: Array<{ ref: string; name: string }>;
      }>("inspect", []);
      assert.match(observation.url, /\/apply/);
      assert.match(observation.title, /Apply/i);
      assert.ok(observation.controls.some((c) => /full name/i.test(c.name)));
      assert.ok(observation.controls.some((c) => c.ref.startsWith("e")));
      assert.ok(world.node?.session.worker.workerInfo);
    } finally {
      chat.close();
    }
  });
});
