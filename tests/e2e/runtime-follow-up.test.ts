import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { createMockModel } from "../../src/runtime/mock-model.ts";
import { TOOL_ACT } from "../../src/runtime/names.ts";
import { runTask } from "../../src/runtime/runtime.ts";
import { memoryEvidence } from "../../src/runtime/evidence.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import type { ContextRecord } from "../../src/runtime/metrics.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await server.stop();
});

describe("compaction during a long epoch", () => {
  it("drops superseded snapshots without rewriting the front of the prompt", async () => {
    const tab = await browser.openTab(`${origin}/apply`);
    const evidence = memoryEvidence();
    await runTask({
      card: {
        objective: "Fill as Ada Lovelace, ada@example.com. Do not submit.",
        criteria: [{ kind: "text_visible", text: "Thanks Ada Lovelace" }],
        startUrl: `${origin}/apply`,
        policy: "auto",
      },
      followUps: ["Now submit the application."],
      stream: createMockModel({
        plans: [
          [
            { tool: TOOL_ACT, target: "Full name", args: { kind: "type", text: "Ada Lovelace" } },
            { tool: TOOL_ACT, target: "Email", args: { kind: "type", text: "ada@example.com" } },
          ],
          [{ tool: TOOL_ACT, target: "Submit application", args: { kind: "click" } }],
        ],
      }),
      tools: { browser, tabId: tab, evidence, policy: "auto" },
    });

    const contexts = evidence.metrics.records.filter(
      (record): record is ContextRecord => record.kind === "context",
    );
    const dump = contexts
      .map(
        (record) =>
          `t${record.turn}:rw=${record.rewrittenFrom},ph=${record.placeholderBytes},msg=${record.messages}`,
      )
      .join("; ");
    assert.ok(contexts.length >= 3, `expected several turns, saw ${contexts.length} (${dump})`);
    assert.ok(
      contexts.every((record) => record.rewrittenFrom !== 0),
      `must not invalidate the prompt from index 0 (${dump})`,
    );

    const firstPlaceholders = contexts.find((record) => record.placeholderBytes > 0);
    assert.ok(firstPlaceholders, `compaction should drop superseded snapshots (${dump})`);
    assert.ok(
      firstPlaceholders.turn > 1,
      `placeholders on turn ${firstPlaceholders.turn} is too early (${dump})`,
    );

    const last = contexts[contexts.length - 1]!;
    assert.ok(last.placeholderBytes > 0, `the run should keep placeholders (${dump})`);
    assert.ok(last.rewrittenFrom < 0, `the last turn must leave the prefix (${dump})`);

    let floor = firstPlaceholders.rewrittenFrom;
    for (const record of contexts) {
      if (record.turn <= firstPlaceholders.turn || record.rewrittenFrom < 0) continue;
      assert.ok(
        record.rewrittenFrom >= floor,
        `turn ${record.turn} rewrote index ${record.rewrittenFrom}, inside the placeholder prefix (${dump})`,
      );
      floor = record.rewrittenFrom;
    }
  });
});
