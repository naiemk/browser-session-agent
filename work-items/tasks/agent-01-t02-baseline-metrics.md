---
id: AGENT-01-T02
title: Recorded baseline before any mechanism
story: AGENT-01
epic: agent
status: todo
depends: AGENT-01-T01
---

# AGENT-01-T02 — Recorded baseline before any mechanism

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D19: a baseline is recorded before any mechanism lands
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — results log protocol

## Possible

- `scripts/run-suite.ts` from AGENT-01-T01
- `docs/autonomous-agent.md` — results log table

## Do

1. Run the suite against **today's** agent, unchanged, with a fake or cheap model configuration that is reproducible.
2. Record one row in the results log: date, commit SHA, change (`baseline`), success rate, steps per task, cost per task, and notes on model and configuration used.
3. Commit the raw JSON output under a stable path so later runs can be diffed rather than re-measured.
4. Document how to reproduce the run in one command.

## Tests

Not a unit test. The artifact is the committed baseline JSON plus the results-log row. `tests/unit/agent-suite.test.ts` covers the runner itself.

## Done when

The results log in `docs/autonomous-agent.md` has a `baseline` row with all three metrics filled and a commit SHA, the raw JSON is committed, and a single documented command reproduces it. No mechanism task may merge before this exists (D19).
