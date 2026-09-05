import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { FileRecorder, MemoryRecorder, readMetrics } from "../../src/optimize/recorder.ts";
import { hashOf, observationStats } from "../../src/runtime/metrics.ts";
import { measureContext } from "../../src/runtime/prune.ts";
import { PLACEHOLDER, type PrunableMessage } from "../../src/runtime/prune.ts";
import type { WireObservation } from "../../src/runtime/wire.ts";

let root = "";

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "metrics-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the metrics recorder", () => {
  it("buffers in memory for tests and rollups", () => {
    const recorder = new MemoryRecorder();
    recorder.record({ kind: "tool_result", turn: 1, tool: "observe", bytes: 10, hash: "abc" });
    assert.equal(recorder.records.length, 1);
  });

  it("writes one JSON object per line and reads it back", async () => {
    const file = path.join(root, "run-a", "metrics.jsonl");
    const recorder = await FileRecorder.open(file);

    recorder.record({ kind: "tool_result", turn: 1, tool: "observe", bytes: 900, hash: "h1" });
    recorder.record({
      kind: "turn",
      turn: 1,
      inputTokens: 1200,
      outputTokens: 40,
      cacheReadTokens: 0,
      cacheWriteTokens: 1200,
      costUsd: 0.0012,
    });
    await recorder.flush();

    const records = await readMetrics(file);
    assert.equal(records.length, 2);
    assert.equal(records[0]?.kind, "tool_result");
    assert.equal(records[1]?.kind, "turn");
  });

  it("appends rather than replacing, so a resumed run keeps its history", async () => {
    const file = path.join(root, "run-b", "metrics.jsonl");
    const first = await FileRecorder.open(file);
    first.record({ kind: "tool_result", turn: 1, tool: "probe", bytes: 100, hash: "h1" });
    await first.flush();

    const second = await FileRecorder.open(file);
    second.record({ kind: "tool_result", turn: 2, tool: "probe", bytes: 100, hash: "h1" });
    await second.flush();

    assert.equal((await readMetrics(file)).length, 2);
  });

  it("tolerates a truncated tail, because runs get killed", async () => {
    const file = path.join(root, "run-c", "metrics.jsonl");
    const recorder = await FileRecorder.open(file);
    recorder.record({ kind: "tool_result", turn: 1, tool: "act", bytes: 5, hash: "h" });
    await recorder.flush();
    await appendFile(file, '{"kind":"turn","tur', "utf8");

    const records = await readMetrics(file);
    assert.equal(records.length, 1, "the good line survives a half-written one");
  });

  it("returns nothing for a run that was never metered", async () => {
    assert.deepEqual(await readMetrics(path.join(root, "absent", "metrics.jsonl")), []);
  });
});

describe("observation statistics", () => {
  const observation = (controls: WireObservation["controls"]): WireObservation => ({
    url: "https://x.test/rows",
    title: "Rows",
    controls,
  });

  it("counts controls that share a role and name, which is what breaks the delta", () => {
    const stats = observationStats(
      observation([
        { ref: "e1", role: "checkbox", name: "Select" },
        { ref: "e2", role: "checkbox", name: "Select" },
        { ref: "e3", role: "checkbox", name: "Select" },
        { ref: "e4", role: "button", name: "Save" },
      ]),
    );
    assert.equal(stats.controls, 4);
    assert.equal(stats.keyCollisions, 3, "the three identical checkboxes collide");
  });

  it("reports no collisions when every control is distinct", () => {
    const stats = observationStats(
      observation([
        { ref: "e1", role: "link", name: "ada" },
        { ref: "e2", role: "link", name: "bob" },
      ]),
    );
    assert.equal(stats.keyCollisions, 0);
  });

  it("hashes stably, so an unchanged read is detectable", () => {
    assert.equal(hashOf("same"), hashOf("same"));
    assert.notEqual(hashOf("same"), hashOf("different"));
  });
});

describe("context accounting", () => {
  const message = (content: unknown, extra: Partial<PrunableMessage> = {}): PrunableMessage => ({
    role: "toolResult",
    content,
    ...extra,
  });

  it("finds the earliest rewrite, which is where the prompt cache stops helping", () => {
    const before: PrunableMessage[] = [
      message("objective", { role: "user" }),
      message("snapshot 1"),
      message("snapshot 2"),
    ];
    const afterPrune: PrunableMessage[] = [
      before[0]!,
      { ...before[1]!, content: PLACEHOLDER },
      before[2]!,
    ];

    const measured = measureContext(before, afterPrune);
    assert.equal(measured.rewrittenFrom, 1);
    assert.ok(measured.placeholderBytes > 0);
    assert.equal(measured.bytes, measured.liveBytes + measured.placeholderBytes);
  });

  it("shows that pruning a small payload costs bytes rather than saving them", () => {
    // The placeholder is 53 characters. Superseding anything shorter makes the context
    // bigger, which is why the saving has to be measured on real snapshots and not
    // assumed from a fixture.
    const tiny: PrunableMessage[] = [message("small")];
    const pruned: PrunableMessage[] = [{ ...tiny[0]!, content: PLACEHOLDER }];
    assert.ok(measureContext(tiny, pruned).bytes > measureContext(tiny, tiny).bytes);

    const realistic: PrunableMessage[] = [message("x".repeat(2800))];
    const prunedRealistic: PrunableMessage[] = [{ ...realistic[0]!, content: PLACEHOLDER }];
    assert.ok(
      measureContext(realistic, prunedRealistic).bytes <
        measureContext(realistic, realistic).bytes / 10,
    );
  });

  it("reports no rewrite when nothing was superseded", () => {
    const messages: PrunableMessage[] = [message("a"), message("b")];
    const measured = measureContext(messages, messages);
    assert.equal(measured.rewrittenFrom, -1);
    assert.equal(measured.placeholderBytes, 0);
  });
});
