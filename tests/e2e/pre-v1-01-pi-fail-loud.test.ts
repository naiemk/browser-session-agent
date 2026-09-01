import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import {
  chatClient,
  closeV1,
  register,
  startV1Api,
  uniqueUser,
  waitFor,
  type V1World,
} from "../helpers/v1.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-01 Pi fail-loud when BSA_NO_PI unset", () => {
  it("keeps the process up, reports pi: false, and does not stub I heard you", async () => {
    const world = await startV1Api({ requirePaid: false, failPi: true });
    worlds.push(world);
    assert.equal(process.env.BSA_NO_PI, undefined);

    const health = (await fetch(`${world.origin}/healthz`).then((r) => r.json())) as {
      ok: boolean;
      pi: boolean;
      reason?: string;
    };
    assert.equal(health.ok, true);
    assert.equal(health.pi, false);
    assert.ok(health.reason);

    const user = await uniqueUser();
    const { cookie } = await register(world.origin, user.email, user.password);
    const chat = await chatClient(world.api.port, cookie);
    try {
      chat.send({ type: "prompt", text: "hello from fail-loud" });
      const err = await waitFor(chat.inbox, (m) => m.type === "error");
      assert.match(String(err.message ?? ""), /Pi agent is not running/);
      const dump = JSON.stringify(chat.inbox);
      assert.doesNotMatch(dump, /I heard you/);
    } finally {
      chat.close();
    }
  });

  it("treats BSA_FAKE_PI as pi ready", async () => {
    const world = await startV1Api({ requirePaid: false, fakePi: true });
    worlds.push(world);
    const health = (await fetch(`${world.origin}/healthz`).then((r) => r.json())) as { pi: boolean };
    assert.equal(health.pi, true);
  });

  it("omits BSA_PI_FAIL from production pack files", async () => {
    const files = [
      "deploy/vibed/vibed-infra-config.yml",
      "deploy/vibed/api-config.yaml",
      "deploy/docker/compose.vps.yml",
      "deploy/docker/Dockerfile.api",
      "deploy/vibed/Dockerfile.api",
    ];
    for (const rel of files) {
      const text = await readFile(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(text, /BSA_PI_FAIL/);
    }
  });
});
