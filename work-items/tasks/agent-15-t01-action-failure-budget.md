---
id: AGENT-15-T01
title: Stage failures and bound no-progress recovery
story: AGENT-15
epic: agent
status: done
---

# AGENT-15-T01 — Stage failures and bound no-progress recovery

## Discovery

1. Reclassify the Berlin run's 35 `ok:false`, 10 refused, and 17 tool-error actions by
   target, precondition, execution, postcondition, challenge, and recovery stage.
2. Group retry chains by intent, page identity, target, error code, and evidence hash.
3. Measure fixed timeout cost, model turns, and changed evidence per retry.
4. Correlate observation collisions/truncation with stale refs and wrong targets.
5. Identify cases where the browser effect succeeded but the expectation was wrong.

## Fix

1. Add typed failure stages and stable retry-chain IDs.
2. Record strategy and evidence deltas for every retry.
3. Add host-enforced per-intent and per-page attempts, elapsed-time, and no-progress limits.
4. Reject an identical retry without new evidence or a changed strategy.
5. Return effect status separately from postcondition status.
6. Emit a resumable checkpoint and focused recovery hint when the budget ends.
7. Expose counters and breaker decisions through a host-neutral attempt contract so a
   durable scheduler can persist them without importing model-loop internals.

## Evidence

- Fixtures for stale ref, hidden/occluded control, navigation timeout, wrong postcondition,
  no-op scroll, challenge, and successful second strategy.
- Exact stage totals and time attribution on replayed Berlin evidence.
- No action executes after the no-progress budget.
- No premature stop before the allowed changed strategy.
- Before/after unsuccessful-action rate, turns, wall time, completion, and evidence coverage
  on a comparable live run.
- Direct, Fabric, interactive, and scheduled attempts obey the same stop decision.

## Discussion

- Which limits belong inside one tool call versus across model turns?
- Should a wrong postcondition update the task state when the effect is independently
  observable?
- What evidence change is sufficient to justify another attempt?
- Which counters reset per tool call, attempt, work item, host resource, and job window?

## Done when

Failure stages and retry chains are measurable, all budget canaries pass, and live evidence
shows lower unsuccessful work without lower task completion.
