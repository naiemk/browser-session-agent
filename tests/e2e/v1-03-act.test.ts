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

describe("V1-03-T02 act on the helper", () => {
  it("types and clicks through the helper and the observation changes", async () => {
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
      const before = await hub.call<{
        url: string;
        controls: Array<{ ref: string; name: string; value?: string }>;
      }>("inspect", []);
      const email = before.controls.find((c) => /email/i.test(c.name));
      assert.ok(email);
      const typed = await hub.call<{
        observation: { controls: Array<{ ref: string; value?: string }> };
        verification: { status: string };
      }>("act", [{ action: "type", ref: email.ref, text: "ada@example.com" }]);
      assert.equal(typed.verification.status, "passed");
      const afterType = typed.observation.controls.find((c) => c.ref === email.ref);
      assert.match(afterType?.value ?? "", /ada@example.com/);

      const page = await hub.call<{ controls: Array<{ ref: string; name: string }> }>("inspect", []);
      const button = page.controls.find((c) => /sign in/i.test(c.name) && c.ref !== email.ref);
      assert.ok(button);
      const clicked = await hub.call<{
        observation: { url: string; errors: string[]; recentChanges: string[] };
        verification: { status: string };
      }>("act", [{ action: "click", ref: button.ref }]);
      assert.ok(
        clicked.observation.errors.length > 0 ||
          clicked.observation.recentChanges.length > 0 ||
          clicked.verification.status === "passed",
      );
    } finally {
      chat.close();
    }
  });
});
