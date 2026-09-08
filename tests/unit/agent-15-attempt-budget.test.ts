import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AttemptBudgetTracker,
  attemptChainId,
  classifyFailureStage,
  DEFAULT_ATTEMPT_BUDGET,
} from "../../src/runtime/attempt-budget.ts";
import { allowRetry, emptyRetryLedger } from "../../src/durable/application/context-compiler.ts";

describe("AGENT-15 attempt budgets", () => {
  it("rejects identical retry without new evidence or strategy", () => {
    const tracker = new AttemptBudgetTracker({ ...DEFAULT_ATTEMPT_BUDGET, maxAttempts: 5 });
    const key = {
      goalId: "g1",
      pageIdentity: "https://ex.test/a",
      intent: "click_apply",
      target: "e1",
      stage: "execution" as const,
    };
    assert.equal(tracker.decide({ key, evidenceHash: "h1", strategy: "same" }).allow, true);
    const second = tracker.decide({ key, evidenceHash: "h1", strategy: "same" });
    assert.equal(second.allow, false);
    assert.equal(second.reason, "no_progress");
    assert.equal(tracker.decide({ key, evidenceHash: "h1", strategy: "retarget" }).allow, true);
    assert.equal(tracker.decide({ key, evidenceHash: "h2", strategy: "same" }).allow, true);
  });

  it("stops after max attempts and returns non-retryable outcome", () => {
    const tracker = new AttemptBudgetTracker({
      maxAttempts: 2,
      maxElapsedMs: 60_000,
      requireEvidenceOrStrategyChange: false,
    });
    const key = {
      goalId: "g1",
      pageIdentity: "p",
      intent: "fill",
      stage: "postcondition" as const,
    };
    assert.ok(tracker.decide({ key, evidenceHash: "a", strategy: "same" }).allow);
    assert.ok(tracker.decide({ key, evidenceHash: "b", strategy: "same" }).allow);
    const third = tracker.decide({ key, evidenceHash: "c", strategy: "same" });
    assert.equal(third.allow, false);
    assert.equal(third.reason, "max_attempts");
    const outcome = tracker.exhaustedOutcome({
      key,
      evidenceIds: ["e1"],
      code: "no_progress_budget",
      checkpoint: { intent: "fill", evidenceIds: ["e1"] },
    });
    assert.equal(outcome.status, "blocked");
    if (outcome.status === "blocked") {
      assert.equal(outcome.block.kind, "takeover");
      assert.equal(outcome.checkpoint.intent, "fill");
    }
  });

  it("classifies failure stages from action signals", () => {
    assert.equal(classifyFailureStage({ challenge: true }), "challenge");
    assert.equal(classifyFailureStage({ targetMissing: true }), "target");
    assert.equal(classifyFailureStage({ preconditionFailed: true }), "precondition");
    assert.equal(classifyFailureStage({ postconditionFailed: true }), "postcondition");
    assert.equal(classifyFailureStage({ code: "navigation_timeout" }), "execution");
  });

  it("shares no-new-evidence rule with durable allowRetry", () => {
    const ledger = emptyRetryLedger();
    const first = allowRetry(ledger, "executor", 3, "ev1");
    assert.equal(first.ok, true);
    const second = allowRetry(first.next, "executor", 3, "ev1");
    assert.equal(second.ok, false);
    assert.equal(second.reason, "no_new_evidence");
    assert.ok(attemptChainId({ goalId: "j", pageIdentity: "p", intent: "i" }).includes("j::p::i"));
  });
});
