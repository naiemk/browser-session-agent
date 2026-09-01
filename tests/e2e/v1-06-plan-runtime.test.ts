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

const typeNotesByLabel = {
  context: { understanding: "Notes field on a labeled form.", hint: { urlIncludes: "/plan-labeled" } },
  goal: "Type hello into Notes",
  actions: [
    {
      id: "type_notes",
      intent: "Type hello",
      try: [
        {
          name: "by_label",
          steps: [{ op: "type", target: { by: "label", label: "Notes" }, text: "hello" }],
          successWhen: { kind: "value_includes", target: { by: "label", label: "Notes" }, text: "hello" },
        },
      ],
    },
  ],
};

describe("V1-06-T01 PlanRuntime on Playwright", () => {
  it("types a labeled input by name, not by a hardcoded ref", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat, hub } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/plan-labeled type notes`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const result = await hub.call<{ status: string }>("runPlan", [typeNotesByLabel]);
      assert.equal(result.status, "completed");
      const observation = await hub.call<{
        controls: Array<{ name: string; value?: string }>;
      }>("inspect", []);
      const notes = observation.controls.find((c) => /notes/i.test(c.name));
      assert.equal(notes?.value, "hello");
    } finally {
      chat.close();
    }
  });

  it("fails a stale ref after the DOM changes and succeeds by label", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const { chat, hub } = await connectPaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/plan-labeled type notes`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      const before = await hub.call<{ controls: Array<{ ref: string; name: string }> }>("inspect", []);
      const notesRef = before.controls.find((c) => /notes/i.test(c.name))?.ref;
      assert.ok(notesRef);
      const inject = before.controls.find((c) => /inject prefix/i.test(c.name));
      assert.ok(inject);
      await hub.call("act", [{ action: "click", ref: inject.ref }]);

      const stale = await hub.call<{ status: string; actuals: string[] }>("runPlan", [
        {
          context: {
            understanding: "Notes field after a DOM prepend.",
            hint: { urlIncludes: "/plan-labeled" },
          },
          goal: "Type with a stale ref",
          actions: [
            {
              id: "stale",
              intent: "Type via stale ref",
              try: [
                {
                  name: "by_ref",
                  steps: [{ op: "type", target: { by: "ref", ref: notesRef }, text: "stale" }],
                  successWhen: { kind: "value_includes", target: { by: "label", label: "Notes" }, text: "stale" },
                },
              ],
            },
          ],
        },
      ]);
      assert.equal(stale.status, "escalated");

      const labeled = await hub.call<{ status: string }>("runPlan", [typeNotesByLabel]);
      assert.equal(labeled.status, "completed");
      const observation = await hub.call<{
        controls: Array<{ name: string; value?: string }>;
      }>("inspect", []);
      const notes = observation.controls.find((c) => /notes/i.test(c.name));
      assert.equal(notes?.value, "hello");
    } finally {
      chat.close();
    }
  });
});
