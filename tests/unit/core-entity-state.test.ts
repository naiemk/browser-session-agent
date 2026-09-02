import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { GoalStore } from "../../src/core/state.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "core-state-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("AGENT-00-T02 entity-oriented state", () => {
  it("advances entities independently within one goal", async () => {
    const store = await GoalStore.open(root, "goal_1", "apply to suitable roles");
    const a = await store.addEntity({ label: "Acme" });
    const b = await store.addEntity({ label: "Globex" });
    const c = await store.addEntity({ label: "Initech" });

    await store.setStage(a.entityId, "contacted");
    await store.park(b.entityId, {
      reason: "captcha on the application form",
      wake: "human",
      perishable: true,
    });

    const active = await store.activeEntities();
    const parked = await store.parkedEntities();

    assert.deepEqual(
      active.map((entity) => entity.label).sort(),
      ["Acme", "Initech"],
      "parking one entity must not stop the others",
    );
    assert.deepEqual(parked.map((entity) => entity.label), ["Globex"]);
    assert.equal(parked[0]?.parked?.wake, "human");
    assert.equal(parked[0]?.parked?.perishable, true);
    assert.equal((await store.getEntity(c.entityId))?.stage, "discovered");
  });

  it("refuses a duplicate idempotency key", async () => {
    const store = await GoalStore.open(root, "goal_2");
    const entity = await store.addEntity({ label: "Acme" });

    const first = await store.claim(entity.entityId, "submit:acme:application");
    const second = await store.claim(entity.entityId, "submit:acme:application");

    assert.equal(first, true, "the first claim must succeed");
    assert.equal(second, false, "a repeated consequential action must be refused");
    assert.equal(await store.isConsumed(entity.entityId, "submit:acme:application"), true);

    const other = await store.addEntity({ label: "Globex" });
    assert.equal(
      await store.claim(other.entityId, "submit:acme:application"),
      true,
      "keys are scoped per entity",
    );
  });

  it("reconstructs full state in a fresh store with no session context", async () => {
    const first = await GoalStore.open(root, "goal_3", "reach email companies");
    const entity = await first.addEntity({ label: "Mailgun", facts: { size: "mid" } });
    await first.setStage(entity.entityId, "contacted");
    await first.claim(entity.entityId, "invite:mailgun");
    await first.mergeFacts(entity.entityId, { contact: "Ada" });
    await first.mergeGoalFacts({ pitch: "email extension" });

    // A different process would do exactly this: open by id and read.
    const reopened = await GoalStore.open(root, "goal_3");
    const record = await reopened.requireEntity(entity.entityId);

    assert.equal(record.stage, "contacted");
    assert.deepEqual(record.facts, { size: "mid", contact: "Ada" });
    assert.equal(await reopened.isConsumed(entity.entityId, "invite:mailgun"), true);
    assert.equal((await reopened.goal()).goal, "reach email companies");
    assert.equal((await reopened.goal()).facts.pitch, "email extension");
  });

  it("unparks and finishes entities", async () => {
    const store = await GoalStore.open(root, "goal_4");
    const entity = await store.addEntity({ label: "Acme" });
    await store.park(entity.entityId, { reason: "waiting on reply", wake: "third_party", perishable: false });
    assert.equal((await store.parkedEntities()).length, 1);

    await store.unpark(entity.entityId);
    assert.equal((await store.parkedEntities()).length, 0);

    await store.finish(entity.entityId, { status: "success", detail: "applied" });
    const done = await store.requireEntity(entity.entityId);
    assert.equal(done.outcome?.status, "success");
    assert.equal((await store.activeEntities()).length, 0);
  });
});
