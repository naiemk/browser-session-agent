import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { nullEvidence } from "../../src/runtime/evidence.ts";
import { TOOL_ASK } from "../../src/runtime/names.ts";
import { buildTools } from "../../src/runtime/tools.ts";

function askTool(askUser?: (question: string) => Promise<string | undefined>) {
  const tools = buildTools({
    browser: {} as BrowserPort,
    evidence: nullEvidence(),
    ...(askUser ? { askUser } : {}),
  });
  return tools.find((tool) => (tool as { name: string }).name === TOOL_ASK) as {
    execute: (id: string, params: unknown) => Promise<{ content: Array<{ text?: string }> }>;
  };
}

function textOf(result: { content: Array<{ text?: string }> }): string {
  return result.content.map((part) => part.text ?? "").join("");
}

describe("ask_user", () => {
  it("says nobody is available when the host did not wire a prompt", async () => {
    const result = await askTool().execute("t1", { question: "Which platform?" });
    assert.match(textOf(result), /Nobody available/);
  });

  it("tells the model to stop when the operator does not answer", async () => {
    const result = await askTool(async () => undefined).execute("t1", {
      question: "Which platform?",
    });
    assert.match(textOf(result), /Do not invent an answer/);
    assert.doesNotMatch(textOf(result), /Nobody available/);
  });

  it("returns the operator's answer", async () => {
    const result = await askTool(async () => "Instagram").execute("t1", {
      question: "Which platform?",
    });
    assert.match(textOf(result), /"answered":true/);
    assert.match(textOf(result), /Instagram/);
  });
});
