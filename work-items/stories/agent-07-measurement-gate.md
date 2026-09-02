# AGENT-07: Let measurement pick what comes next

Status: todo

As the team, we decide the next architectural investment from suite data rather than from argument, and we record what settled each open question.

## Acceptance criteria

- Both session strategies run the same suite behind one switch, with no other differences.
- Two results-log rows exist comparing them on success rate, steps per task, and cost per task.
- D27 is moved out of `hypothesis` with a one-line evidence note.
- The suite reports distinct archetypes, archetype revisits, turns spent re-perceiving a known archetype, and prediction hit rate.
- A results-log row records the archetype finding, and the memory half of D28 is resolved either way.
- "Repeats are rare, stop here" is an accepted outcome and is written down if it happens.

## Decisions

D19, D27 (session strategy hypothesis), D28 (planner and memory gated), D29.

## Tasks

- [AGENT-07-T01](../tasks/agent-07-t01-session-strategy-experiment.md)
- [AGENT-07-T02](../tasks/agent-07-t02-memory-instrumentation.md)

## Tests

`tests/unit/agent-session-strategy.test.ts`, `tests/unit/agent-archetype-signature.test.ts`, `tests/unit/agent-instrumentation.test.ts`. The comparisons themselves are artifacts in the results log.
