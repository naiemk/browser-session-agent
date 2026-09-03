---
id: AGENT-01-T01
title: Browser task suite and runner
story: AGENT-01
epic: agent
status: todo
---

# AGENT-01-T01 — Browser task suite and runner

## Spec

- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — measure before mechanism
- [docs/decisions.md](../../docs/decisions.md) — D19 (scoreboard), D20 (criteria are external)
- [docs/test-design.md](../../docs/test-design.md) — existing fixture map

## Possible

- `tests/fixtures/site/` — existing `/apply`, `/combobox`, `/jsonlint` pages to extend (kept per D34)
- `tests/helpers/fixture-server.ts` — fixture host
- `src/plan/evaluate.ts` — the old predicate evaluator, a reference for **shape only**; the new check engine is written fresh in the new core (D34)
- New: `src/suite/tasks.ts` for definitions, `src/suite/runner.ts` plus the CLI for the runner

## Do

1. Define a `SuiteTask` shape: `id`, `goal` (natural language, as a user would say it), `startUrl`, `criteria` (predicate program), optional `maxSteps`, optional `tags`.
2. Author at least 20 tasks over fixtures covering: form with validation, multi-step flow, combobox, file upload, pagination, an ambiguous page with two plausible controls, a flow that must be abandoned, and a page that emits console and network errors.
3. Criteria are authored **with the task** and are data, not code branches. The agent never sees a mutable copy.
4. Build the suite CLI (`src/cli`): runs each task against the agent, enforces `maxSteps`, records per-task outcome, steps used, and token or dollar cost.
5. Emit machine-readable output (JSON) plus a one-line human summary.
6. Tasks must run against local fixtures by default. Any real-web task is behind an explicit flag and excluded from the default gate.
7. Take a **target switch** so the same suite can score the old core or the new one (D35). The baseline in AGENT-01-T02 is the old core's score.

## Tests

- `tests/unit/agent-suite.test.ts` — a task whose criteria are trivially true passes; a task whose criteria are false fails; `maxSteps` exhaustion is reported as a distinct outcome from a criteria failure; the runner's JSON output validates against the expected shape.
- Suite definitions load without a browser (pure data assertion).

## Done when

the suite CLI (`src/cli`) runs the full suite headless in CI, exits non-zero only on runner error (not on task failure), and prints success rate, steps per task, and cost per task. `tests/unit/agent-suite.test.ts` is in the `npm test` glob and passes. At least 20 tasks exist with externally authored criteria.
