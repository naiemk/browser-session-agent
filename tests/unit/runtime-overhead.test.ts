import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { composeAgent, fixedOverhead } from "../../src/runtime/agent.ts";
import { nullEvidence } from "../../src/runtime/evidence.ts";
import { ALL_TOOLS } from "../../src/runtime/names.ts";

describe("fixed tool overhead", () => {
  it("keeps 16 tools after park and discover", () => {
    const composed = composeAgent({
      card: { objective: "test", criteria: [], policy: "ask" },
      tools: { browser: {} as BrowserPort, evidence: nullEvidence() },
    });
    const overhead = fixedOverhead(composed);
    assert.equal(overhead.toolCount, 16);
    assert.equal(ALL_TOOLS.length, 16);
    assert.ok(
      overhead.toolSchemaBytes < 12_000,
      `toolSchemaBytes ${overhead.toolSchemaBytes} grew past the job-tool budget`,
    );
  });
});
