# AGENT-03: An oracle the agent cannot fake

Status: todo

As the operator, a task is successful only when criteria I supplied evaluate true against the live page — not when the agent says it finished.

## Acceptance criteria

- `Criterion` is a predicate program evaluated in code, with no model call in the evaluation path.
- Criteria are attached at task creation and stored with the run; a resume re-reads the same criteria.
- The evaluated copy is unreachable from any tool argument, so the executor cannot weaken or replace it.
- A task claiming success against false criteria is recorded as a failure.
- `browser_check` lets the agent author additional step-level checks, validated against the closed predicate set.
- Step checks are additive: all of them passing cannot make a task successful when the stored criteria fail.
- Failed checks read like the existing action-harness recovery notes.

## Decisions

D20 (criteria come from outside the executor — extends D17), D18 (closed DSL).

## Tasks

- [AGENT-03-T01](../tasks/agent-03-t01-external-criteria.md)
- [AGENT-03-T02](../tasks/agent-03-t02-step-checks.md)

## Tests

`tests/unit/agent-criteria.test.ts`, `tests/unit/agent-step-checks.test.ts`, `tests/e2e/agent-03-criteria.test.ts`.
