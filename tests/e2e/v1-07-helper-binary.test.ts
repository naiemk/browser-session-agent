import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
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

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-07-T01 helper binary pairing", () => {
  it("pairs and reconnects from the file credential store without BSA_TOKEN", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    const { cookie, account } = await register(world.origin, user.email, user.password);
    const code = await issuePairCode(world.origin, cookie);
    const chat = await chatClient(world.api.port, cookie);
    let child = spawnHelper(world.api.port, world.home, {
      BSA_PAIR_CODE: code,
      BSA_CREDENTIAL_STORE: "file",
    });
    try {
      assert.equal(child.spawnargs.includes("BSA_TOKEN"), false);
      assert.equal(child.spawnfile, process.execPath);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected, 20_000);
      assert.equal(world.api.registry.hubFor(account.id).connected, true);

      const storePath = path.join(world.home, "credentials", "device.json");
      const raw = await readFile(storePath, "utf8");
      assert.doesNotMatch(raw, /password/i);
      assert.doesNotMatch(raw, /BSA_TOKEN/);
      const stored = JSON.parse(raw) as { deviceToken?: string };
      assert.ok(stored.deviceToken);
      assert.notEqual(stored.deviceToken, user.password);
      assert.notEqual(stored.deviceToken, code);

      const afterKill = chat.inbox.length;
      await stopChild(child);
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && !m.connected, 12_000, afterKill);

      const afterRelaunch = chat.inbox.length;
      child = spawnHelper(world.api.port, world.home, { BSA_CREDENTIAL_STORE: "file" });
      await waitFor(chat.inbox, (m) => m.type === "nodeStatus" && m.connected, 20_000, afterRelaunch);
      assert.equal(world.api.registry.hubFor(account.id).connected, true);
    } finally {
      chat.close();
      await stopChild(child);
    }
  });
});
