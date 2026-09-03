import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOOL_CHECK, TOOL_OBSERVE, TOOL_PROBE } from "../../src/runtime/names.ts";
import { PLACEHOLDER, pruneMessages, type PrunableMessage } from "../../src/runtime/prune.ts";

function toolResult(
  toolName: string,
  content: string,
  extra: Partial<PrunableMessage> = {},
): PrunableMessage {
  return { role: "toolResult", toolName, content, ...extra };
}

const TRANSCRIPT: PrunableMessage[] = [
  { role: "user", content: "objective: apply for the role" },
  { role: "assistant", content: "looking" },
  toolResult(TOOL_OBSERVE, "snapshot 1"),
  { role: "assistant", content: "typing" },
  toolResult(TOOL_OBSERVE, "snapshot 2"),
  toolResult(TOOL_CHECK, "check: not yet submitted"),
  toolResult(TOOL_PROBE, "probe: required fields are name and email"),
  toolResult(TOOL_OBSERVE, "snapshot 3"),
];

describe("context pruning", () => {
  it("keeps the newest snapshot and supersedes older ones", () => {
    const pruned = pruneMessages(TRANSCRIPT);
    const snapshots = pruned.filter((message) => message.toolName === TOOL_OBSERVE);
    assert.equal(snapshots[0]?.content, PLACEHOLDER);
    assert.equal(snapshots[1]?.content, PLACEHOLDER);
    assert.equal(snapshots[2]?.content, "snapshot 3");
  });

  it("keeps every message so tool calls retain a matching result", () => {
    const pruned = pruneMessages(TRANSCRIPT);
    assert.equal(pruned.length, TRANSCRIPT.length);
    assert.deepEqual(
      pruned.map((message) => message.role),
      TRANSCRIPT.map((message) => message.role),
    );
  });

  it("never prunes the objective, checks, or reasoning", () => {
    const pruned = pruneMessages(TRANSCRIPT);
    assert.match(String(pruned[0]?.content), /objective/);
    assert.equal(
      pruned.find((message) => message.toolName === TOOL_CHECK)?.content,
      "check: not yet submitted",
    );
    assert.equal(pruned.filter((message) => message.role === "assistant").length, 2);
  });

  it("keeps error results, because they explain the failure", () => {
    const pruned = pruneMessages([
      toolResult(TOOL_OBSERVE, "snapshot 1", { isError: true }),
      toolResult(TOOL_OBSERVE, "snapshot 2"),
      toolResult(TOOL_OBSERVE, "snapshot 3"),
    ]);
    assert.equal(pruned[0]?.content, "snapshot 1");
    assert.equal(pruned[1]?.content, PLACEHOLDER);
    assert.equal(pruned[2]?.content, "snapshot 3");
  });

  it("gives each perishable tool its own budget", () => {
    const pruned = pruneMessages([
      toolResult(TOOL_PROBE, "probe 1"),
      toolResult(TOOL_PROBE, "probe 2"),
      toolResult(TOOL_OBSERVE, "snapshot 1"),
    ]);
    assert.equal(pruned[0]?.content, PLACEHOLDER);
    assert.equal(pruned[1]?.content, "probe 2");
    assert.equal(pruned[2]?.content, "snapshot 1");
  });

  it("honours a larger keepLatest", () => {
    const pruned = pruneMessages(TRANSCRIPT, { keepLatest: 2 });
    const snapshots = pruned.filter((message) => message.toolName === TOOL_OBSERVE);
    assert.equal(snapshots[0]?.content, PLACEHOLDER);
    assert.equal(snapshots[1]?.content, "snapshot 2");
    assert.equal(snapshots[2]?.content, "snapshot 3");
  });
});
