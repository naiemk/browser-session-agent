import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AgentError } from "../../src/domain/types.ts";
import { selectCountryUnitedStates } from "../../src/plan/examples.ts";
import {
  chatClient,
  closeV1,
  issuePairCode,
  markPaid,
  register,
  spawnHelper,
  startV1Api,
  stopChild,
  uniqueUser,
  waitFor,
  withFixture,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-E2E consumer onboarding gate", () => {
  it("registers, pairs, runs the country plan, takeovers, then fails closed when the helper quits", async () => {
    const world = await withFixture(await startV1Api());
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie, account } = await register(world.origin, user.email, user.password);
    await markPaid(world.origin, cookie);
    const code = await issuePairCode(world.origin, cookie);
    const chat = await chatClient(world.api.port, cookie);
    const child = spawnHelper(world.api.port, world.home, { BSA_PAIR_CODE: code });
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected, 20_000);
      const hub = world.api.registry.hubFor(account.id);

      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/combobox?mode=united-states-first select country`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 20_000);

      const plan = await hub.call<{ status: string; actuals: string[] }>("runPlan", [selectCountryUnitedStates]);
      assert.ok(plan.status === "completed" || plan.status === "escalated");
      assert.ok(plan.actuals.length > 0);
      if (plan.status === "completed") {
        const observation = await hub.call<{
          controls: Array<{ name: string; value?: string }>;
        }>("inspect", []);
        const country = observation.controls.find((c) => /^country$/i.test(c.name) || c.name.startsWith("Country"));
        assert.match(country?.value ?? "", /United|USA/);
      } else {
        assert.match(plan.actuals.join("\n"), /type_united_states|scroll_until|not yet/i);
      }

      const before = await hub.call<{ id: string }>("inspect", []);
      chat.send({ type: "command", name: "browser-takeover", args: "" });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Takeover"), 15_000);
      hub.forwardTakeoverInput({ kind: "mouse", action: "move", x: 0.3, y: 0.3 });
      chat.send({ type: "command", name: "browser-resume", args: "" });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Resumed"), 15_000);
      const after = await hub.call<{ id: string }>("inspect", []);
      assert.notEqual(after.id, before.id);

      const afterQuit = chat.inbox.length;
      await stopChild(child);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && !m.connected, 12_000, afterQuit);
      await assert.rejects(
        () => hub.call("inspect", []),
        (err: unknown) => err instanceof AgentError && err.code === "helper_disconnected",
      );

      chat.send({ type: "prompt", text: "still chatting" });
      const event = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && String(m.event?.text ?? "").includes("still chatting"),
      );
      assert.ok(event);
    } finally {
      chat.close();
      await stopChild(child);
    }
  });
});
