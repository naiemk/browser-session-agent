import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readJsonFile, writeJsonAtomic } from "../../src/core/atomic.ts";
import { FakeClock } from "../../src/core/clock.ts";
import { acquireLease } from "../../src/core/lease.ts";
import { Ledger } from "../../src/core/ledger.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "atomic-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("atomic json and leases", () => {
  it("replaces a snapshot without leaving partial JSON readable", async () => {
    const file = path.join(root, "state.json");
    await writeJsonAtomic(file, { ok: true, n: 1 });
    await writeJsonAtomic(file, { ok: true, n: 2 });
    assert.deepEqual(await readJsonFile(file), { ok: true, n: 2 });
    const raw = await readFile(file, "utf8");
    JSON.parse(raw);
  });

  it("lets only one owner in, then recovers after expiry", async () => {
    const clock = new FakeClock();
    const dir = path.join(root, "lock");
    const first = await acquireLease(dir, { owner: "a", ttlMs: 1000, clock, token: "t1" });
    assert.ok(first);
    const second = await acquireLease(dir, { owner: "b", ttlMs: 1000, clock, token: "t2" });
    assert.equal(second, undefined);
    clock.advance(2000);
    const third = await acquireLease(dir, { owner: "b", ttlMs: 1000, clock, token: "t3" });
    assert.ok(third);
    await third.release();
  });

  it("ignores a truncated final ledger line and rejects a broken interior line", async () => {
    const ledger = await Ledger.open(root, "g1");
    await ledger.append({ type: "note", intent: "one" });
    const file = path.join(root, "goals", "g1", "events.jsonl");
    const existing = await readFile(file, "utf8");
    await writeFile(file, `${existing}{"type":"note","intent":"partial`, "utf8");
    const events = await Ledger.readFrom(root, "g1");
    assert.equal(events.length, 1);

    await writeFile(file, `not-json\n{"type":"note"}\n`, "utf8");
    await assert.rejects(() => Ledger.readFrom(root, "g1"));
  });
});
