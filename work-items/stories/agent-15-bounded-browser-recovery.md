# AGENT-15: Browser recovery is bounded

Status: todo

As an operator, failed selectors, stale refs, bad postconditions, and no-progress actions
terminate or change strategy quickly instead of consuming an open-ended model loop.

## Acceptance criteria

- Action results distinguish target, precondition, execution, postcondition, challenge,
  and recovery stages.
- Retry chains are joinable by intent, page identity, target, and evidence change.
- Repeating an action requires new evidence or a different recovery strategy.
- Per-intent and per-page budgets stop no-progress loops with a resumable checkpoint.
- Successful effects with incorrect postconditions are represented separately from actions
  that never happened.
- Bounded recovery does not prematurely stop the second valid strategy in fixtures.

## Spec

- [Live-run investigation PERF-13](../../docs/live-run-investigation-plan.md)
- [Challenge and approval handling](../../docs/challenge-and-approval-handling.md)

## Tasks

- [AGENT-15-T01](../tasks/agent-15-t01-action-failure-budget.md)

## Done when

Failure stages and retry cost are measurable, the bounded fixture suite passes, and one
comparable live run materially lowers unsuccessful actions without lowering completion.
