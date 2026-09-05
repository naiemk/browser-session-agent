import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeToolResult } from "../../src/runtime/summary.ts";
import {
  TOOL_ACT,
  TOOL_ASK,
  TOOL_CHECK,
  TOOL_DONE,
  TOOL_FORK,
  TOOL_OBSERVE,
  TOOL_PEEK,
  TOOL_SURVEY,
} from "../../src/runtime/names.ts";
import { toWireObservation, wireText } from "../../src/runtime/wire.ts";
import type { Observation } from "../../src/core/types.ts";

function pageWith(controls: number): Observation {
  return {
    observationId: "obs_1",
    tabId: "tab_1",
    url: "https://www.instagram.com/vika/followers",
    title: "Followers",
    controls: Array.from({ length: controls }, (_, index) => ({
      ref: `c${index}`,
      role: "link",
      name: `person_${index}`,
      selector: `a:nth-child(${index})`,
      row: `person_${index} Display Name ${index} Follow`,
    })),
    dialogs: ["Followers"],
    errors: [],
    consoleErrors: [],
    failedRequests: [],
    changes: ["3 new controls"],
    at: new Date().toISOString(),
  } as unknown as Observation;
}

describe("one line per tool result", () => {
  it("says where it is and how much is there, instead of the whole page", () => {
    const details = toWireObservation(pageWith(40));
    const summary = summarizeToolResult(TOOL_OBSERVE, details);

    // The payload that used to be printed verbatim, for scale.
    assert.ok(wireText(details).length > 2000, "a real snapshot is thousands of characters");
    assert.ok(summary.length <= 110, `summary must fit a line, got ${summary.length}`);
    assert.equal(summary.includes("\n"), false, "one line means one line");

    assert.match(summary, /instagram\.com\/vika\/followers/);
    assert.match(summary, /40 controls/);
    assert.match(summary, /1 dialogs/);
    assert.match(summary, /\+1 changes/);
  });

  it("leads with the failure, whichever tool produced it", () => {
    assert.match(
      summarizeToolResult(TOOL_ACT, { ok: false, why: ['text_visible: "varya" not found'] }),
      /^FAILED: text_visible: "varya" not found/,
    );
    assert.match(
      summarizeToolResult(TOOL_OBSERVE, { error: "no tab is open" }),
      /^error: no tab is open/,
    );
    assert.match(
      summarizeToolResult(TOOL_ACT, { refused: "precondition_failed", why: "not on the page" }),
      /^refused \(precondition_failed\): not on the page/,
    );
    assert.match(
      summarizeToolResult(TOOL_ACT, { done: false, parked: "needs approval" }),
      /^parked for approval: needs approval/,
    );
  });

  it("describes each tool in its own terms", () => {
    assert.match(summarizeToolResult(TOOL_CHECK, { passed: false, checks: ["FAIL url"] }), /^FAIL/);
    assert.match(summarizeToolResult(TOOL_ASK, { answered: false }), /nobody answered/);
    assert.match(
      summarizeToolResult(TOOL_FORK, { recorded: "friend list", candidates: 3, resolution: "asked" }),
      /"friend list" had 3 meanings, asked/,
    );
    assert.match(
      summarizeToolResult(TOOL_DONE, { status: "blocked", summary: "login wall" }),
      /^blocked: login wall/,
    );
    assert.match(
      summarizeToolResult(TOOL_SURVEY, {
        url: "https://example.com/x",
        navigation: [1, 2],
        actions: [1],
        content: [],
      }),
      /example\.com\/x offers 2 navigation, 1 actions/,
    );
  });

  it("reports a peek that landed on the wrong url, and where it still is", () => {
    const summary = summarizeToolResult(TOOL_PEEK, {
      page: toWireObservation(pageWith(2)),
      matched: false,
      stillOn: "https://www.instagram.com/vika/followers",
    });
    assert.match(summary, /wrong url/);
    assert.match(summary, /still on instagram\.com\/vika\/followers/);
  });

  it("never invents detail for a tool it does not know", () => {
    assert.equal(summarizeToolResult("something_new", { whatever: true }), "done");
  });
});
