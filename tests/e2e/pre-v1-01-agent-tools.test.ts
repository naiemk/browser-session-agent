import assert from "node:assert/strict";
import { TOOL_OBSERVE } from "../../src/runtime/names.ts";
import { afterEach, describe, it } from "node:test";
import { AgentError } from "../../src/domain/types.ts";
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

describe("PRE-01-T02 prompt uses browser tools when helper connected", () => {
  it("invokes the composed observe tool, not a stub and not the legacy one", async () => {
    const world = await withFixture(await startV1Api({ requirePaid: false, fakePi: true }));
    worlds.push(world);
    const { chat, hub } = await connectUnpaidConsumer(world);
    try {
      chat.send({
        type: "command",
        name: "browser-start",
        args: `--url ${world.fixtureOrigin}/apply inspect the page`,
      });
      await waitFor(chat.inbox, (m) => m.type === "notify" && m.message.includes("Started"), 15_000);
      assert.equal(hub.connected, true);

      const from = chat.inbox.length;
      chat.send({ type: "prompt", text: "inspect the page" });
      const call = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && m.event?.toolName === TOOL_OBSERVE,
        15_000,
        from,
      );
      assert.equal(call.event?.toolName, TOOL_OBSERVE);
      const result = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && m.event?.type === "tool_result",
        15_000,
        from,
      );
      assert.equal(result.event?.isError, false);
      assert.doesNotMatch(String(result.event?.text ?? ""), /I heard you/);

      const afterQuit = chat.inbox.length;
      await world.node?.close();
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && !m.connected, 12_000, afterQuit);
      await assert.rejects(
        () => hub.call("inspect", []),
        (err: unknown) => err instanceof AgentError && err.code === "helper_disconnected",
      );

      const afterChat = chat.inbox.length;
      chat.send({ type: "prompt", text: "inspect after disconnect" });
      const reply = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && String(m.event?.text ?? "").includes("inspect after disconnect"),
        12_000,
        afterChat,
      );
      assert.match(String(reply.event?.text ?? ""), /^Pi:/);
      assert.doesNotMatch(String(reply.event?.text ?? ""), /I heard you/);
      const toolErr = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && m.event?.type === "tool_result",
        12_000,
        afterChat,
      );
      assert.equal(toolErr.event?.isError, true);
    } finally {
      chat.close();
    }
  });
});
