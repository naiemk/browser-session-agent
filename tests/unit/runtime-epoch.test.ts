import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compactPiContext } from "../../src/host/pi-compaction.ts";
import {
  compactFinishedWork,
  epochStart,
  isPlaceholder,
  measureContext,
  type PrunableMessage,
} from "../../src/runtime/prune.ts";
import { meterPiSession, turnClock } from "../../src/host/pi-metering.ts";
import { memoryEvidence } from "../../src/runtime/evidence.ts";
import { extractText } from "../../src/runtime/wire.ts";
import { createFakePi } from "../helpers/fake-pi.ts";

const snapshot = (url: string) =>
  JSON.stringify({ url, controls: [{ ref: "e1", role: "link", name: "x".repeat(400) }] });

function look(tool: string, url: string): PrunableMessage {
  // Pi's toolResult.content is an array of parts. Compaction used to replace it with a
  // bare string, and the next GLM turn crashed: `toolMsg.content.filter is not a function`.
  return {
    role: "toolResult",
    toolName: tool,
    content: [{ type: "text", text: snapshot(url) }],
  };
}

/**
 * The exact call GLM makes, from @earendil-works/pi-ai openai-completions:
 *   toolMsg.content.filter(isTextContentBlock)
 */
function glmRead(content: unknown): void {
  const parts = content as { filter: (fn: (part: unknown) => boolean) => unknown[] };
  assert.equal(typeof parts.filter, "function", JSON.stringify(content));
  parts.filter((part) => (part as { type?: string }).type === "text");
}

function glmCanReadTranscript(messages: readonly PrunableMessage[]): void {
  for (const message of messages) {
    if (message.role !== "toolResult") continue;
    glmRead(message.content);
  }
}

/**
 * The transcript from the run that crashed: string-shaped results mixed with parts,
 * then a follow-up. Compaction wrapping only dropped snapshots was not enough —
 * note_fork, ask_user and report were kept as strings.
 */
function planBetterTranscript(): PrunableMessage[] {
  const minskPage = JSON.stringify({
    url: "https://www.instagram.com/",
    title: "Instagram",
    controls: [{ ref: "e107", role: "searchbox", name: "Search" }],
  });
  return [
    { role: "user", content: "find a friend from minsk" },
    { role: "assistant", content: "searching" },
    { role: "toolResult", toolName: "observe", content: minskPage },
    { role: "toolResult", toolName: "act", content: "ok, nothing changed" },
    { role: "toolResult", toolName: "note_fork", content: "friend from Minsk had 2 meanings" },
    {
      role: "toolResult",
      toolName: "ask_user",
      content: [{ type: "text", text: "nobody answered" }],
    },
    { role: "toolResult", toolName: "report", content: "blocked: search returned businesses" },
    { role: "user", content: "Plan better" },
  ];
}

function transcript(): PrunableMessage[] {
  return [
    { role: "user", content: "open the site" },
    { role: "assistant", content: "looking" },
    look("observe", "https://example.com/a"),
    look("act", "https://example.com/b"),
    { role: "assistant", content: "I established that you are acting as ada" },
    { role: "toolResult", toolName: "remember", content: [{ type: "text", text: '{"stored":"identity"}' }] },
    look("peek", "https://example.com/c"),
    // A new request. Everything above it is finished work.
    { role: "user", content: "now find varya" },
    { role: "assistant", content: "on it" },
    look("observe", "https://example.com/d"),
  ];
}

describe("finding where the current piece of work starts", () => {
  it("is the operator's most recent message", () => {
    assert.equal(epochStart(transcript()), 7);
  });

  it("is the whole conversation when they have only asked once", () => {
    assert.equal(
      epochStart([{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]),
      0,
    );
  });
});

describe("dropping the snapshots from finished work", () => {
  it("leaves the current piece of work completely alone", () => {
    const messages = transcript();
    const compacted = compactFinishedWork(messages);

    assert.deepEqual(compacted.slice(7), messages.slice(7));
  });

  it("keeps what was worked out, and drops the pages it was worked out on", () => {
    const compacted = compactFinishedWork(transcript());

    assert.match(String(compacted[4]!.content), /acting as ada/, "its own account survives");
    assert.match(extractText(compacted[5]!.content) ?? "", /identity/, "so does what it recorded");

    const dropped = compacted
      .slice(0, 7)
      .filter((message) => isPlaceholder(message.content)).length;
    assert.equal(dropped, 2, "three dead pages, one kept to act on");
  });

  it("keeps one snapshot rather than one per tool, since none of them are live", () => {
    const compacted = compactFinishedWork(transcript());
    const live = compacted
      .slice(0, 7)
      .filter((message) => message.role === "toolResult" && !isPlaceholder(message.content));

    // The remember result is not a snapshot, so it is not one of the ones being counted.
    assert.equal(live.filter((message) => message.toolName !== "remember").length, 1);
  });

  it("changes nothing at all inside a piece of work", () => {
    // The property the saving depends on. Providers bill a cached prefix at a fraction of
    // the input price and a rewrite near the front invalidates everything after it, so
    // compacting every turn costs more than never compacting. This must be idempotent
    // across the turns of one epoch.
    const messages = transcript();
    const first = compactFinishedWork(messages);
    const later = compactFinishedWork([
      ...messages,
      { role: "assistant", content: "still working" },
      look("act", "https://example.com/e"),
    ]);

    assert.equal(measureContext(first, later).rewrittenFrom, -1, "the prefix must not move");
  });

  it("does not touch a failure, which is the reason a step went the way it did", () => {
    const compacted = compactFinishedWork([
      { role: "user", content: "first" },
      { role: "toolResult", toolName: "act", isError: true, content: [{ type: "text", text: snapshot("https://a") }] },
      { role: "toolResult", toolName: "act", content: [{ type: "text", text: snapshot("https://b") }] },
      { role: "toolResult", toolName: "act", content: [{ type: "text", text: snapshot("https://c") }] },
      { role: "user", content: "second" },
    ]);
    assert.equal(isPlaceholder(compacted[1]!.content), false);
  });

  it("wraps string-shaped results on a follow-up, including ones it did not drop", () => {
    const compacted = compactFinishedWork(planBetterTranscript());
    glmCanReadTranscript(compacted);
    const fork = compacted.find((message) => message.toolName === "note_fork");
    assert.deepEqual(fork?.content, [{ type: "text", text: "friend from Minsk had 2 meanings" }]);
  });

  it("wraps string-shaped results even inside one piece of work", () => {
    const messages: PrunableMessage[] = [
      { role: "user", content: "hi" },
      { role: "toolResult", toolName: "observe", content: "snapshot" },
    ];
    const compacted = compactFinishedWork(messages);
    glmCanReadTranscript(compacted);
    assert.deepEqual(compacted[1]!.content, [{ type: "text", text: "snapshot" }]);
  });

  it("does not clone an already Pi-shaped context with no follow-up", () => {
    const messages = [{ role: "user", content: "hi" }, look("observe", "https://example.com")];
    assert.equal(compactFinishedWork(messages), messages);
  });
});

describe("compaction in the session Pi drives", () => {
  it("shrinks the context and lets the metering see the smaller one", async () => {
    const pi = createFakePi();
    const evidence = memoryEvidence();

    // Registration order is the contract: Pi hands each handler what the last returned.
    compactPiContext(pi);
    meterPiSession(pi, evidence, { goalId: "g", cardBytes: 1, toolSchemaBytes: 1, toolCount: 1 }, turnClock());

    const messages = transcript();
    const [compacted] = (await pi.emit("context", { type: "context", messages })) as [
      { messages: PrunableMessage[] } | undefined,
    ];
    assert.ok(compacted?.messages, "a boundary must produce a smaller context");

    const record = evidence.metrics.records.find((entry) => entry.kind === "context") as
      | { bytes: number; placeholderBytes: number }
      | undefined;
    assert.ok(record);
    assert.ok(
      record.placeholderBytes > 0,
      "the recorded turn must be the turn that was sent, not the one we declined to send",
    );
    assert.ok(record.bytes < JSON.stringify(messages).length);
  });

  it("leaves a dropped result in a shape Pi can still serialise", async () => {
    const pi = createFakePi();
    compactPiContext(pi);
    const [result] = (await pi.emit("context", {
      type: "context",
      messages: transcript(),
    })) as [{ messages: PrunableMessage[] } | undefined];

    assert.ok(result?.messages, "a follow-up must produce a context, or the check is vacuous");
    glmCanReadTranscript(result.messages);
  });

  it("wraps every tool result on the follow-up that used to crash GLM", async () => {
    // The Instagram run: first sub-goal searched Minsk, reported blocked, then the
    // operator said "Plan better". Compaction rewrote the prefix and left forks,
    // questions and reports as strings. Pi's OpenAI path (the one GLM uses) then
    // did toolMsg.content.filter(...) and threw.
    const pi = createFakePi();
    compactPiContext(pi);
    const messages = planBetterTranscript();
    const [result] = (await pi.emit("context", { type: "context", messages })) as [
      { messages: PrunableMessage[] } | undefined,
    ];

    assert.ok(result?.messages, "string-shaped results are a real change and must be returned");
    glmCanReadTranscript(result.messages);

    const fork = result.messages.find((message) => message.toolName === "note_fork");
    assert.deepEqual(fork?.content, [{ type: "text", text: "friend from Minsk had 2 meanings" }]);
    const report = result.messages.find((message) => message.toolName === "report");
    assert.deepEqual(report?.content, [
      { type: "text", text: "blocked: search returned businesses" },
    ]);
  });

  it("can be turned off, so what it is worth stays measurable", async () => {
    const pi = createFakePi();
    compactPiContext(pi, { enabled: false });
    assert.deepEqual(await pi.emit("context", { type: "context", messages: transcript() }), []);
  });

  it("leaves an already Pi-shaped turn inside one piece of work alone", async () => {
    const pi = createFakePi();
    compactPiContext(pi);
    const messages = [{ role: "user", content: "hi" }, look("observe", "https://example.com")];
    assert.deepEqual(await pi.emit("context", { type: "context", messages }), [undefined]);
  });
});
