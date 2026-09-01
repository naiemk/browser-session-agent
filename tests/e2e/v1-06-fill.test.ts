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

describe("V1-06-T04 browser_fill sugar", () => {
  it("fills multiple labeled fields in one call", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat, hub } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/fill fill profile`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const result = await hub.call<{
        ok: boolean;
        observation: { controls: Array<{ name: string; value?: string }> };
      }>("fill", [
        {
          fields: [
            { label: "Full name", text: "Ada Lovelace" },
            { label: "Email", text: "ada@example.com" },
          ],
        },
      ]);
      assert.equal(result.ok, true);
      const name = result.observation.controls.find((c) => /full name/i.test(c.name));
      const email = result.observation.controls.find((c) => /email/i.test(c.name));
      assert.match(name?.value ?? "", /Ada Lovelace/);
      assert.match(email?.value ?? "", /ada@example.com/);
    } finally {
      chat.close();
    }
  });

  it("stops on the first rejected field and does not apply later fields", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat, hub } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/fill fill profile`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const result = await hub.call<{
        ok: boolean;
        failedField?: string;
        observation: { controls: Array<{ name: string; value?: string }> };
      }>("fill", [
        {
          fields: [
            { label: "Full name", text: "Ada Lovelace" },
            { label: "City", text: "Boston" },
            { label: "Email", text: "ada@example.com" },
          ],
        },
      ]);
      assert.equal(result.ok, false);
      assert.equal(result.failedField, "City");
      const email = result.observation.controls.find((c) => /email/i.test(c.name));
      const city = result.observation.controls.find((c) => /city/i.test(c.name));
      const name = result.observation.controls.find((c) => /full name/i.test(c.name));
      assert.match(name?.value ?? "", /Ada Lovelace/);
      assert.equal(city?.value ?? "", "");
      assert.equal(email?.value ?? "", "");
    } finally {
      chat.close();
    }
  });

  it("submits only after every field is accepted", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat, hub } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/fill fill profile`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const rejected = await hub.call<{ ok: boolean; submitted: boolean; observation: { url: string } }>("fill", [
        {
          fields: [
            { label: "Full name", text: "Ada Lovelace" },
            { label: "City", text: "Boston" },
          ],
          submit: { label: "Save profile" },
        },
      ]);
      assert.equal(rejected.ok, false);
      assert.equal(rejected.submitted, false);
      assert.match(rejected.observation.url, /\/fill/);

      const accepted = await hub.call<{
        ok: boolean;
        submitted: boolean;
        observation: { url: string; title: string };
      }>("fill", [
        {
          fields: [
            { label: "Full name", text: "Ada Lovelace" },
            { label: "Email", text: "ada@example.com" },
          ],
          submit: { label: "Save profile" },
        },
      ]);
      assert.equal(accepted.ok, true);
      assert.equal(accepted.submitted, true);
      assert.match(accepted.observation.title, /submitted/i);
    } finally {
      chat.close();
    }
  });
});
