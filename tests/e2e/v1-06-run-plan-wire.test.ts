import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AgentError } from "../../src/domain/types.ts";
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

const smallPlan = {
  context: { understanding: "Notes field.", hint: { urlIncludes: "/plan-labeled" } },
  goal: "Type hello",
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

describe("V1-06-T03 browser_run_plan on the wire", () => {
  it("streams progress for a valid plan and returns actuals", async () => {
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
      const from = chat.inbox.length;
      const result = await hub.call<{ status: string; actuals: string[]; progress: Array<{ type: string }> }>(
        "runPlan",
        [smallPlan],
      );
      assert.equal(result.status, "completed");
      assert.ok(result.actuals.length > 0);
      const kinds = [
        ...result.progress.map((e) => e.type),
        ...chat.inbox
          .slice(from)
          .filter((m) => m.type === "agentEvent")
          .map((m) => String(m.event?.type ?? "")),
      ];
      for (const kind of ["action_start", "attempt_start", "plan_done"]) {
        assert.ok(kinds.includes(kind), `missing ${kind} in ${kinds.join(",")}`);
      }
    } finally {
      chat.close();
    }
  });

  it("rejects a Playwright-JS-shaped plan before any act", async () => {
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
      await assert.rejects(
        () =>
          hub.call("runPlan", [
            {
              context: { understanding: "js" },
              goal: "hack",
              actions: [
                {
                  id: "a",
                  intent: "x",
                  try: [
                    {
                      name: "js",
                      steps: [{ op: "evaluate", script: "document.querySelector('input').value = 'pwned'" }],
                      successWhen: { kind: "text_visible", text: "ok" },
                    },
                  ],
                },
              ],
            },
          ]),
        (err: unknown) => err instanceof AgentError && err.code === "invalid_plan",
      );
      const observation = await hub.call<{
        controls: Array<{ name: string; value?: string }>;
      }>("inspect", []);
      const notes = observation.controls.find((c) => /notes/i.test(c.name));
      assert.equal(notes?.value ?? "", "");
    } finally {
      chat.close();
    }
  });
});
