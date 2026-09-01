import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { AgentError } from "../../src/domain/types.ts";
import {
  chatClient,
  closeV1,
  issuePairCode,
  register,
  spawnHelper,
  startV1Api,
  stopChild,
  uniqueUser,
  waitFor,
  type V1World,
} from "../helpers/v1.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-04-T01 Docker node pair without BSA_TOKEN", () => {
  it("does not require BSA_TOKEN in compose or run-desktop-node.sh", async () => {
    const compose = await readFile(path.join(ROOT, "deploy/docker/compose.node.yml"), "utf8");
    const script = await readFile(path.join(ROOT, "scripts/run-desktop-node.sh"), "utf8");
    assert.match(compose, /ghcr\.io\/naiemk\/browser-session-node/);
    assert.match(compose, /BSA_PAIR_CODE/);
    assert.match(compose, /BSA_HOME: \/data/);
    assert.match(compose, /BSA_HEADLESS: \$\{BSA_HEADLESS:-1\}/);
    assert.doesNotMatch(compose, /BSA_TOKEN:\$\{BSA_TOKEN:\?/);
    assert.doesNotMatch(compose, /BSA_TOKEN:\?set BSA_TOKEN/);
    assert.match(script, /BSA_PAIR_CODE/);
    assert.match(script, /BSA_HOME=\/data/);
    assert.doesNotMatch(script, /\[\[ -z "\$API_URL" \|\| -z "\$TOKEN" \]\]/);
    assert.match(script, /\[\[ -z "\$API_URL" \]\]/);
  });

  it("pairs with BSA_PAIR_CODE, stores the device token, and reconnects without BSA_TOKEN", async () => {
    const world = await startV1Api({ requirePaid: false });
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie, account } = await register(world.origin, user.email, user.password);
    const code = await issuePairCode(world.origin, cookie);
    const chat = await chatClient(world.api.port, cookie);
    let child = spawnHelper(world.api.port, world.home, { BSA_PAIR_CODE: code });
    try {
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected, 20_000);
      const stored = await readFile(path.join(world.home, "credentials", "device.json"), "utf8");
      assert.match(stored, /deviceToken/);
      assert.doesNotMatch(stored, /BSA_TOKEN/);

      const afterKill = chat.inbox.length;
      await stopChild(child);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && !m.connected, 12_000, afterKill);
      await assert.rejects(
        () => world.api.registry.hubFor(account.id).call("inspect", []),
        (err: unknown) => err instanceof AgentError && err.code === "helper_disconnected",
      );

      const afterRelaunch = chat.inbox.length;
      child = spawnHelper(world.api.port, world.home);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected, 20_000, afterRelaunch);
    } finally {
      chat.close();
      await stopChild(child);
    }
  });
});
