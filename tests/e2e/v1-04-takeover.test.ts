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

describe("V1-04-T02 takeover and resume", () => {
  it("accepts remote input only during takeover and resumes from a new observation", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat, hub } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/login sign in`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const before = await hub.call<{ id: string }>("inspect", []);

      assert.throws(
        () => hub.forwardTakeoverInput({ kind: "mouse", action: "move", x: 0.2, y: 0.2 }),
        /awaiting_takeover/,
      );

      chat.send({ type: "command", name: "browser-takeover", args: "" });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Takeover"));
      hub.forwardTakeoverInput({ kind: "mouse", action: "move", x: 0.2, y: 0.2 });

      await assert.rejects(() => hub.call("act", [{ action: "click", ref: "e1" }]));

      chat.send({ type: "command", name: "browser-resume", args: "" });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Resumed"), 15_000);
      const after = await hub.call<{ id: string; url: string }>("inspect", []);
      assert.notEqual(after.id, before.id);

      const typed = await hub.call<{ verification: { status: string } }>("act", [
        {
          action: "type",
          ref: (await hub.call<{ controls: Array<{ ref: string; name: string }> }>("inspect", [])).controls.find((c) =>
            /email/i.test(c.name),
          )?.ref,
          text: "ada@example.com",
        },
      ]);
      assert.equal(typed.verification.status, "passed");
    } finally {
      chat.close();
    }
  });
});
