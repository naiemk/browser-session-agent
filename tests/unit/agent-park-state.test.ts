import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { GoalStore } from "../../src/core/state.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "park-state-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("park as a normal outcome", () => {
  it("round-trips reason, wake, and perishability independently per entity", async () => {
    const store = await GoalStore.open(root, "goal_1", "apply");
    const a = await store.addEntity({ label: "A" });
    const b = await store.addEntity({ label: "B" });
    const c = await store.addEntity({ label: "C" });
    await store.park(b.entityId, {
      reason: "captcha",
      wake: "human",
      perishable: true,
      recommendedRetryMs: 3_600_000,
      handoff: "re-open the application form",
    });
    const parked = await store.parkedEntities();
    assert.equal(parked.length, 1);
    assert.equal(parked[0]?.parked?.wake, "human");
    assert.equal(parked[0]?.parked?.perishable, true);
    assert.equal((await store.activeEntities()).length, 2);
    void a;
    void c;
  });

  it("refuses a duplicate idempotency key", async () => {
    const store = await GoalStore.open(root, "goal_2");
    const entity = await store.addEntity({ label: "Acme" });
    assert.equal(await store.claim(entity.entityId, "send:acme"), true);
    assert.equal(await store.claim(entity.entityId, "send:acme"), false);
  });
});
