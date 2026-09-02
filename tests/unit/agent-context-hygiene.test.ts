import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PLACEHOLDER,
  pruneMessages,
  registerContextPruning,
  type PrunableMessage,
} from "../../src/agent/context-pruning.ts";
import { TOOL_CHECK, TOOL_OBSERVE, TOOL_PROBE } from "../../src/agent/tool-names.ts";

function toolResult(toolName: string, content: string, extra: Partial<PrunableMessage> = {}): PrunableMessage {
  return { role: "toolResult", toolName, content, ...extra };
}

const CONVERSATION: PrunableMessage[] = [
  { role: "user", content: "task card: apply for the role. criteria: confirmation visible" },
  { role: "assistant", content: "looking at the page" },
  toolResult(TOOL_OBSERVE, "observation 1"),
  { role: "assistant", content: "typing" },
  toolResult(TOOL_OBSERVE, "observation 2"),
  toolResult(TOOL_CHECK, "check: confirmation not yet visible"),
  toolResult(TOOL_PROBE, "probe: required fields are name, email"),
  toolResult(TOOL_OBSERVE, "observation 3"),
  { role: "assistant", content: "submitting" },
];

describe("AGENT-04-T02 context pruning", () => {
  it("keeps the newest observation and supersedes the older ones", () => {
    const pruned = pruneMessages(CONVERSATION);
    const observations = pruned.filter((message) => message.toolName === TOOL_OBSERVE);

    assert.equal(observations.length, 3, "messages are kept, only their content is replaced");
    assert.equal(observations[0]?.content, DEFAULT_PLACEHOLDER);
    assert.equal(observations[1]?.content, DEFAULT_PLACEHOLDER);
    assert.equal(observations[2]?.content, "observation 3", "the newest look survives");
  });

  it("never prunes the task card, checks, or assistant reasoning", () => {
    const pruned = pruneMessages(CONVERSATION);
    assert.match(String(pruned[0]?.content), /task card/);
    const check = pruned.find((message) => message.toolName === TOOL_CHECK);
    assert.equal(check?.content, "check: confirmation not yet visible");
    assert.equal(pruned.filter((message) => message.role === "assistant").length, 3);
  });

  it("keeps every message so tool calls retain a matching result", () => {
    const pruned = pruneMessages(CONVERSATION);
    assert.equal(pruned.length, CONVERSATION.length);
    assert.deepEqual(
      pruned.map((message) => message.role),
      CONVERSATION.map((message) => message.role),
    );
  });

  it("keeps error results, because they explain the failure", () => {
    const messages = [
      toolResult(TOOL_OBSERVE, "observation 1", { isError: true }),
      toolResult(TOOL_OBSERVE, "observation 2"),
      toolResult(TOOL_OBSERVE, "observation 3"),
    ];
    const pruned = pruneMessages(messages);
    assert.equal(pruned[0]?.content, "observation 1", "an error result is not noise");
    assert.equal(pruned[1]?.content, DEFAULT_PLACEHOLDER);
    assert.equal(pruned[2]?.content, "observation 3");
  });

  it("honours a larger keepLatest", () => {
    const pruned = pruneMessages(CONVERSATION, { keepLatest: 2 });
    const observations = pruned.filter((message) => message.toolName === TOOL_OBSERVE);
    assert.equal(observations[0]?.content, DEFAULT_PLACEHOLDER);
    assert.equal(observations[1]?.content, "observation 2");
    assert.equal(observations[2]?.content, "observation 3");
  });

  it("prunes each perishable tool independently", () => {
    const messages = [
      toolResult(TOOL_PROBE, "probe 1"),
      toolResult(TOOL_PROBE, "probe 2"),
      toolResult(TOOL_OBSERVE, "observation 1"),
    ];
    const pruned = pruneMessages(messages);
    assert.equal(pruned[0]?.content, DEFAULT_PLACEHOLDER);
    assert.equal(pruned[1]?.content, "probe 2", "the newest probe survives on its own budget");
    assert.equal(pruned[2]?.content, "observation 1");
  });

  it("does not touch messages when switched off", () => {
    const handlers: Array<(event: { messages: PrunableMessage[] }) => unknown> = [];
    const pi = { on: (_event: "context", handler: (event: { messages: PrunableMessage[] }) => unknown) => handlers.push(handler) };

    registerContextPruning(pi, { enabled: false });
    assert.equal(handlers.length, 0, "disabled means the hook is never registered");

    registerContextPruning(pi, { enabled: true });
    assert.equal(handlers.length, 1);
    const result = handlers[0]!({ messages: CONVERSATION }) as { messages: PrunableMessage[] };
    assert.equal(result.messages.filter((m) => m.content === DEFAULT_PLACEHOLDER).length, 2);
  });
});
