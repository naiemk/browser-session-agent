import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TOOL_ACT,
  TOOL_CHECK,
  TOOL_OBSERVE,
  TOOL_PEEK,
  TOOL_PROBE,
} from "../../src/runtime/names.ts";
import {
  isPerishable,
  PLACEHOLDER,
  pruneMessages,
  type PrunableMessage,
} from "../../src/runtime/prune.ts";

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

/**
 * Pruning used to match on tool name, which covered `observe` and `probe` and missed
 * every other tool that returns a snapshot. Those are the expensive ones.
 */
describe("pruning by payload shape", () => {
  const snapshot = (url: string, controls = 30) => ({
    url,
    title: "Roster",
    controls: Array.from({ length: controls }, (_, index) => ({
      ref: `e${index + 1}`,
      role: "button",
      name: `Row ${index + 1}`,
    })),
  });

  const actResult = (url: string) =>
    JSON.stringify({ ok: true, reversibility: "reversible", observation: snapshot(url) });

  const peekResult = (url: string) => JSON.stringify({ matched: true, page: snapshot(url) });

  it("supersedes action-result snapshots, which name-based pruning never touched", () => {
    const pruned = pruneMessages([
      toolResult(TOOL_ACT, actResult("/roster?page=1")),
      toolResult(TOOL_ACT, actResult("/roster?page=2")),
      toolResult(TOOL_ACT, actResult("/roster?page=3")),
    ]);

    assert.equal(pruned[0]?.content, PLACEHOLDER);
    assert.equal(pruned[1]?.content, PLACEHOLDER);
    assert.match(String(pruned[2]?.content), /page=3/, "the newest action result stays whole");
  });

  it("keeps the newest action result, because the next action needs its refs", () => {
    const pruned = pruneMessages([
      toolResult(TOOL_ACT, actResult("/a")),
      toolResult(TOOL_ACT, actResult("/b")),
    ]);
    assert.notEqual(pruned[1]?.content, PLACEHOLDER);
  });

  it("supersedes peeked pages too", () => {
    const pruned = pruneMessages([
      toolResult(TOOL_PEEK, peekResult("/p/ada")),
      toolResult(TOOL_PEEK, peekResult("/p/bob")),
    ]);
    assert.equal(pruned[0]?.content, PLACEHOLDER);
    assert.match(String(pruned[1]?.content), /bob/);
  });

  it("gives each tool its own newest snapshot", () => {
    const pruned = pruneMessages([
      toolResult(TOOL_ACT, actResult("/a")),
      toolResult(TOOL_PEEK, peekResult("/p/ada")),
    ]);
    assert.notEqual(pruned[0]?.content, PLACEHOLDER);
    assert.notEqual(pruned[1]?.content, PLACEHOLDER);
  });

  it("leaves results that carry no snapshot alone, however long they are", () => {
    const verdict = JSON.stringify({ passed: false, checks: ["FAIL text_visible: not found"] });
    const pruned = pruneMessages([
      toolResult(TOOL_CHECK, verdict),
      toolResult(TOOL_CHECK, verdict),
      toolResult(TOOL_CHECK, verdict),
    ]);
    assert.equal(pruned.filter((message) => message.content === PLACEHOLDER).length, 0);
  });

  it("never prunes a user or assistant message that happens to quote a snapshot", () => {
    const messages: PrunableMessage[] = [
      { role: "user", content: actResult("/a") },
      { role: "assistant", content: actResult("/b") },
      toolResult(TOOL_ACT, actResult("/c")),
    ];
    const pruned = pruneMessages(messages);
    assert.equal(pruned.filter((message) => message.content === PLACEHOLDER).length, 0);
  });

  it("recognises a snapshot in text parts, which is how providers carry content", () => {
    const message = toolResult(TOOL_ACT, [
      { type: "text", text: actResult("/a") },
    ] as unknown as string);
    assert.equal(isPerishable(message, new Set()), true);
  });

  it("replaces Pi-shaped content with Pi-shaped content, because GLM calls .filter on it", () => {
    // The crash: `Error: toolMsg.content.filter is not a function`. Compaction ran on
    // the second user message and rewrote the first snapshot as a string. Pi's OpenAI
    // path (the one GLM uses) then did toolMsg.content.filter(...).
    const first = {
      role: "toolResult",
      toolName: TOOL_OBSERVE,
      content: [{ type: "text", text: "snapshot 1" }],
    };
    const second = {
      role: "toolResult",
      toolName: TOOL_OBSERVE,
      content: [{ type: "text", text: "snapshot 2" }],
    };
    const pruned = pruneMessages([first, second]);
    const dropped = pruned[0]!.content as Array<{ type: string; text: string }>;

    assert.equal(typeof dropped.filter, "function");
    assert.deepEqual(
      dropped.filter((part) => part.type === "text").map((part) => part.text),
      [PLACEHOLDER],
    );
    assert.deepEqual(pruned[1]!.content, second.content);
  });

  it("can be turned off, so the saving from shape matching is measurable", () => {
    const pruned = pruneMessages(
      [toolResult(TOOL_ACT, actResult("/a")), toolResult(TOOL_ACT, actResult("/b"))],
      { byShape: false },
    );
    assert.equal(pruned.filter((message) => message.content === PLACEHOLDER).length, 0);
  });
});
