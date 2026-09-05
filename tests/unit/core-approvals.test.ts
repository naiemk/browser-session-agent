import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approvalKey,
  approvalsFromEvents,
  hostOf,
  isStickyApproval,
  normalizeControlName,
} from "../../src/core/approvals.ts";
import type { LedgerEvent } from "../../src/core/ledger.ts";

function event(overrides: Partial<LedgerEvent>): LedgerEvent {
  return {
    id: "ev_1",
    goalId: "g",
    ts: "2026-09-05T00:00:00.000Z",
    type: "approval",
    ...overrides,
  };
}

describe("operator approvals", () => {
  it("keys on host, kind, name and rule, not a snapshot ref", () => {
    const left = approvalKey({
      host: "instagram.com",
      kind: "click",
      name: "Import",
      ruleId: "unmatched",
    });
    const same = approvalKey({
      host: "instagram.com",
      kind: "click",
      name: "  IMPORT ",
      ruleId: "unmatched",
    });
    const other = approvalKey({
      host: "instagram.com",
      kind: "click",
      name: "Submit",
      ruleId: "unmatched",
    });
    assert.equal(left, same);
    assert.notEqual(left, other);
  });

  it("rebuilds the sticky set from ledger rows, ignoring auto-policy", () => {
    const events = [
      event({
        outcome: { ok: true, detail: "approved by user" },
        payload: {
          host: "example.test",
          controlKind: "click",
          controlName: "Import",
          ruleId: "unmatched",
        },
      }),
      event({
        outcome: { ok: true, detail: "auto-approved" },
        payload: {
          host: "example.test",
          controlKind: "click",
          controlName: "Publish",
          ruleId: "outbound-name",
        },
      }),
      event({
        type: "parked",
        outcome: { ok: false, detail: "waiting" },
      }),
    ];
    const keys = approvalsFromEvents(events);
    assert.equal(keys.size, 1);
    assert.ok(
      keys.has(
        approvalKey({
          host: "example.test",
          kind: "click",
          name: "Import",
          ruleId: "unmatched",
        }),
      ),
    );
    assert.equal(isStickyApproval(events[1]!), false);
  });

  it("takes the host from a url", () => {
    assert.equal(hostOf("https://instagram.com/x"), "instagram.com");
    assert.equal(normalizeControlName("  Maybe   later "), "maybe later");
  });
});
