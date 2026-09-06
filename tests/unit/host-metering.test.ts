import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { meterPiSession, turnClock } from "../../src/host/pi-metering.ts";
import { memoryEvidence } from "../../src/runtime/evidence.ts";
import { PLACEHOLDER } from "../../src/runtime/prune.ts";
import { createFakePi } from "../helpers/fake-pi.ts";

const overhead = { goalId: "goal_1", cardBytes: 100, toolSchemaBytes: 200, toolCount: 3 };

function context(messages: unknown[]) {
  return { type: "context", messages };
}

function assistant(usage: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type: "turn_end", message: { model: "acme/1", usage, ...extra } };
}

describe("metering a session someone else drives", () => {
  it("counts turns across the whole session, not from one again per user message", async () => {
    const pi = createFakePi();
    const evidence = memoryEvidence();
    const clock = turnClock();
    meterPiSession(pi, evidence, overhead, clock);

    await pi.emit("context", context([{ role: "user", content: "hi" }]));
    assert.equal(clock.current(), 1);
    await pi.emit("turn_end", assistant({ input: 10, output: 2, cost: { total: 0.1 } }));

    // A second user message. Pi numbers this turn 1 again; the clock does not.
    await pi.emit("context", context([{ role: "user", content: "hi" }, { role: "user", content: "again" }]));
    assert.equal(clock.current(), 2);

    const turns = evidence.metrics.records.filter((record) => record.kind === "context");
    assert.deepEqual(
      turns.map((record) => (record as { turn: number }).turn),
      [1, 2],
      "context records are numbered monotonically so a payload can be joined to one",
    );
  });

  it("measures the context rather than asserting it, including what pruning replaced", async () => {
    const pi = createFakePi();
    const evidence = memoryEvidence();
    meterPiSession(pi, evidence, overhead, turnClock());

    const live = { role: "toolResult", content: "x".repeat(500) };
    await pi.emit("context", context([live]));
    await pi.emit("context", context([{ ...live, content: PLACEHOLDER }, live]));

    const [first, second] = evidence.metrics.records.filter(
      (record) => record.kind === "context",
    ) as Array<{ bytes: number; placeholderBytes: number; rewrittenFrom: number }>;

    assert.ok(first!.bytes > 500, "bytes are the real serialized size");
    assert.equal(first!.placeholderBytes, 0);
    assert.equal(first!.rewrittenFrom, -1, "nothing to compare against on the first turn");

    assert.ok(second!.placeholderBytes > 0, "a replaced snapshot is counted as replaced");
    assert.equal(
      second!.rewrittenFrom,
      0,
      "and the index says where the provider's cache stopped being usable",
    );
  });

  it("records the run once, with the overhead that is resent every turn", async () => {
    const pi = createFakePi();
    const evidence = memoryEvidence();
    meterPiSession(pi, evidence, overhead, turnClock());

    await pi.emit("turn_end", assistant({ input: 1, cost: { total: 0.01 } }));
    await pi.emit("turn_end", assistant({ input: 1, cost: { total: 0.01 } }));

    const runs = evidence.metrics.records.filter((record) => record.kind === "run");
    assert.equal(runs.length, 1);
    assert.equal((runs[0] as { cardBytes: number }).cardBytes, 100);
    assert.equal("thinkingLevel" in runs[0]!, false, "a missing thinking field is omitted, not guessed");
  });

  it("writes the thinking level on every turn, including a mid-session switch", async () => {
    const pi = createFakePi();
    const evidence = memoryEvidence();
    let current: string | undefined;
    meterPiSession(pi, evidence, overhead, turnClock(), () => current);

    await pi.emit(
      "turn_end",
      assistant({ input: 1, cost: { total: 0.01 } }, { thinkingLevel: "high" }),
    );
    await pi.emit("turn_end", assistant({ input: 1, cost: { total: 0.01 } }, { thinking: "low" }));

    const turns = evidence.metrics.records.filter((record) => record.kind === "turn") as Array<{
      thinkingLevel?: string;
    }>;
    assert.deepEqual(
      turns.map((record) => record.thinkingLevel),
      ["high", "low"],
    );

    const run = evidence.metrics.records.find((record) => record.kind === "run") as { thinkingLevel?: string };
    assert.equal(run.thinkingLevel, "high", "the run keeps the first observed level");
  });

  it("asks the host when the message omits thinking, and still omits when neither knows", async () => {
    const pi = createFakePi();
    const evidence = memoryEvidence();
    let current: string | undefined = "high";
    meterPiSession(pi, evidence, overhead, turnClock(), () => current);

    await pi.emit("turn_end", assistant({ input: 1, cost: { total: 0.01 } }));
    current = undefined;
    const other = createFakePi();
    const empty = memoryEvidence();
    meterPiSession(other, empty, overhead, turnClock());
    await other.emit("turn_end", assistant({ input: 1, cost: { total: 0.01 } }));

    const fromHost = evidence.metrics.records.find((record) => record.kind === "turn") as {
      thinkingLevel?: string;
    };
    assert.equal(fromHost.thinkingLevel, "high");
    const omitted = empty.metrics.records.find((record) => record.kind === "turn") as { thinkingLevel?: string };
    assert.equal("thinkingLevel" in omitted, false);
  });
});
