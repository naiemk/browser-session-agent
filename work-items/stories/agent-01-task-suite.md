# AGENT-01: A scoreboard before mechanisms

Status: todo

As the team, we can tell whether a change made the agent more capable, because every change is scored against the same task suite on success rate, steps, and cost.

## Acceptance criteria

- At least 20 goal-shaped tasks exist over local fixtures, each with success criteria authored with the task, never by the agent.
- One command runs the suite headless and emits machine-readable results plus a human summary.
- `maxSteps` exhaustion is reported as an outcome distinct from a criteria failure.
- Steps per task and cost per task are reported alongside success rate, because mechanisms that add turns can be regressions (D29).
- A baseline row for today's unchanged agent exists in the results log with a commit SHA, and the raw JSON is committed.
- Real-web tasks, if any, sit behind a flag and are excluded from the default gate.

## Decisions

D19 (measure before mechanism), D20 (criteria are external), D29 (turn cost discipline).

## Tasks

- [AGENT-01-T01](../tasks/agent-01-t01-suite-and-runner.md)
- [AGENT-01-T02](../tasks/agent-01-t02-baseline-metrics.md)

## Tests

`tests/unit/agent-suite.test.ts`. The baseline itself is an artifact, not a test.
