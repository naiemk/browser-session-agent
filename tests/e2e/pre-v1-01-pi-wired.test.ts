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

describe("PRE-01-T01 Pi starts when BSA_NO_PI unset", () => {
  it("wires a fake Pi session and browser_* tools without a live LLM", async () => {
    const world = await startV1Api({ requirePaid: false, fakePi: true });
    worlds.push(world);
    assert.equal(process.env.BSA_NO_PI, undefined);
    const tools = [...world.api.runtime.api.tools.keys()];
    for (const name of ["browser_inspect", "browser_run_plan", "browser_fill"]) {
      assert.ok(tools.includes(name), `missing ${name} in ${tools.join(",")}`);
    }

    const user = await uniqueUser();
    const { cookie } = await register(world.origin, user.email, user.password);
    const chat = await chatClient(world.api.port, cookie);
    try {
      const models = await waitFor(chat.inbox, (m) => m.type === "models");
      assert.ok(
        (models.models ?? []).some((m) => m.id === "fake/scripted" || m.id === "auto"),
        JSON.stringify(models.models),
      );
      chat.send({ type: "prompt", text: "hello from pre-v1" });
      const event = await waitFor(
        chat.inbox,
        (m) => m.type === "agentEvent" && String(m.event?.text ?? "").includes("hello from pre-v1"),
      );
      const text = String(event.event?.text ?? "");
      assert.match(text, /^Pi:/);
      assert.doesNotMatch(text, /I heard you/);
    } finally {
      chat.close();
    }
  });

  it("omits BSA_NO_PI from the production API image and vibed pack", async () => {
    const dockerfile = await readFile(path.join(ROOT, "deploy/docker/Dockerfile.api"), "utf8");
    const compose = await readFile(path.join(ROOT, "deploy/docker/compose.vps.yml"), "utf8");
    const vibed = await readFile(path.join(ROOT, "deploy/vibed/vibed-infra-config.yml"), "utf8");
    for (const text of [dockerfile, compose, vibed]) {
      assert.doesNotMatch(text, /BSA_NO_PI\s*=/);
    }
  });
});
