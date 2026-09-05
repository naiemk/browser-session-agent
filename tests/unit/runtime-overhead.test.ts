import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserPort } from "../../src/core/browser.ts";
import { composeAgent, fixedOverhead } from "../../src/runtime/agent.ts";
import { nullEvidence } from "../../src/runtime/evidence.ts";
import { ALL_TOOLS } from "../../src/runtime/names.ts";

describe("fixed tool overhead", () => {
  it("keeps 14 tools and drops schema bytes below the recorded 6372", () => {
    const composed = composeAgent({
      card: { objective: "test", criteria: [], policy: "ask" },
      tools: { browser: {} as BrowserPort, evidence: nullEvidence() },
    });
    const overhead = fixedOverhead(composed);
    assert.equal(overhead.toolCount, 14);
    assert.equal(ALL_TOOLS.length, 14);
    assert.ok(
      overhead.toolSchemaBytes < 6372,
      `toolSchemaBytes ${overhead.toolSchemaBytes} did not drop below 6372`,
    );
  });
});
