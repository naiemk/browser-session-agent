import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  bindMagpieModels,
  MAGPIE_MODELS_FILE,
  MODELS_COMMAND,
  parseMagpieModelPins,
  pinError,
  resolveModelPin,
} from "../../src/host/pi-models.ts";
import { createFakePi, runCommand } from "../helpers/fake-pi.ts";

const homes: string[] = [];

afterEach(async () => {
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function tempRoot(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-models-"));
  homes.push(home);
  return home;
}

describe("Magpie model pins", () => {
  it("resolve empty, session, default inherit, and cycles", () => {
    assert.equal(resolveModelPin({ default: "", plan: "", coach: "" }, "coach"), undefined);
    assert.equal(resolveModelPin({ default: "", plan: "session", coach: "" }, "plan"), undefined);
    assert.equal(
      resolveModelPin({ default: "fake/session", plan: "default", coach: "" }, "plan"),
      "fake/session",
    );
    assert.equal(resolveModelPin({ default: "default", plan: "default", coach: "" }, "default"), undefined);
    assert.equal(
      resolveModelPin({ default: "test/plan-opus", plan: "", coach: "default" }, "coach"),
      "test/plan-opus",
    );
    assert.equal(parseMagpieModelPins(undefined).coach, "");
    assert.equal(parseMagpieModelPins({ coach: "  test/strong-coach  " }).coach, "test/strong-coach");
  });

  it("rejects floors and bare names", () => {
    assert.match(pinError("@ultra") ?? "", /floor/i);
    assert.match(pinError("ultra") ?? "", /floor/i);
    assert.match(pinError("not-an-id") ?? "", /provider\/id/);
    assert.equal(pinError("test/strong-coach"), undefined);
  });

  it("round-trips pins through /models", async () => {
    const home = await tempRoot();
    const pi = createFakePi();
    bindMagpieModels(pi, home);
    await pi.startSession();
    await runCommand(pi, MODELS_COMMAND, "");
    assert.match(pi.notifications.join("\n"), /coach: session/);
    await runCommand(pi, MODELS_COMMAND, "coach test/strong-coach");
    assert.match(pi.notifications.join("\n"), /Pinned coach = test\/strong-coach/);
    const saved = JSON.parse(await readFile(path.join(home, MAGPIE_MODELS_FILE), "utf8")) as {
      coach: string;
    };
    assert.equal(saved.coach, "test/strong-coach");
    await runCommand(pi, MODELS_COMMAND, "coach @ultra");
    assert.match(pi.notifications.join("\n"), /floor/i);
    await runCommand(pi, MODELS_COMMAND, "coach session");
    const cleared = JSON.parse(await readFile(path.join(home, MAGPIE_MODELS_FILE), "utf8")) as {
      coach: string;
    };
    assert.equal(cleared.coach, "");
  });

  it("enter/leave restore nested plan then coach", async () => {
    const home = await tempRoot();
    const pi = createFakePi();
    const models = bindMagpieModels(pi, home);
    await pi.startSession();
    await models.setPin("plan", "test/plan-opus", pi.ctx);
    await models.setPin("coach", "test/strong-coach", pi.ctx);
    assert.equal(await models.enter("plan", pi.ctx), undefined);
    assert.equal(pi.currentModelId(), "test/plan-opus");
    assert.equal(await models.enter("coach", pi.ctx), undefined);
    assert.equal(pi.currentModelId(), "test/strong-coach");
    await models.leave(pi.ctx);
    assert.equal(pi.currentModelId(), "test/plan-opus");
    await models.leave(pi.ctx);
    assert.equal(pi.currentModelId(), "fake/session");
  });

  it("default pin is not popped when plan leaves", async () => {
    const home = await tempRoot();
    const pi = createFakePi();
    const models = bindMagpieModels(pi, home);
    await models.setPin("default", "test/plan-opus", pi.ctx);
    await models.setPin("plan", "test/strong-coach", pi.ctx);
    await pi.startSession();
    assert.equal(pi.currentModelId(), "test/plan-opus");
    assert.equal(await models.enter("plan", pi.ctx), undefined);
    assert.equal(pi.currentModelId(), "test/strong-coach");
    await models.leave(pi.ctx);
    assert.equal(pi.currentModelId(), "test/plan-opus");
  });

  it("unknown registry id fails closed without switching", async () => {
    const home = await tempRoot();
    const pi = createFakePi();
    const models = bindMagpieModels(pi, home);
    await pi.startSession();
    await models.setPin("coach", "nope/missing");
    const error = await models.enter("coach", pi.ctx);
    assert.match(error ?? "", /not in the Pi model registry/);
    assert.equal(pi.currentModelId(), "fake/session");
  });

  it("unavailable setModel warns and continues", async () => {
    const home = await tempRoot();
    const pi = createFakePi();
    const models = bindMagpieModels(pi, home);
    await models.setPin("coach", "test/strong-coach");
    delete pi.setModel;
    await pi.startSession();
    const error = await models.enter("coach", pi.ctx);
    assert.equal(error, undefined);
    assert.match(pi.notifications.join("\n"), /skipped/);
    assert.equal(pi.currentModelId(), "fake/session");
    await models.leave(pi.ctx);
  });
});
