---
id: AGENT-03-T02
title: Agent-authored step checks that cannot weaken given criteria
story: AGENT-03
epic: agent
status: todo
depends: AGENT-03-T01
---

# AGENT-03-T02 — Agent-authored step checks that cannot weaken given criteria

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D20 (may add, never soften), D18 (closed DSL)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — the browser's `npm test`

## Possible

Shape references only; implementation is fresh in the new core (D34).

- `src/plan/validate.ts` — the old closed verb set is a good pattern for rejecting open-ended input
- AGENT-03-T01 — the new criterion evaluator this extends

## Do

1. Add `browser_check`: the model submits a predicate program, it is validated against the closed predicate set, evaluated in code, and the pass or fail plus per-check detail is returned.
2. Step checks are additive only. They are recorded as evidence and used for local recovery; they can never substitute for or relax the stored task criteria.
3. Failed checks return the existing `recoveryNote` style so the failure text is consistent with the action harness.
4. Reject unknown predicate kinds and anything script-shaped, following the closed-verb pattern the old `validatePagePlan` used.
5. Prompt guidelines: check after a consequential step rather than assuming, and before proposing that a task is done.

## Tests

- `tests/unit/agent-step-checks.test.ts` — a valid predicate program evaluates; unknown kinds and script-shaped input are rejected; a passing step check does not mark a task successful on its own.
- `tests/e2e/agent-03-criteria.test.ts` extended: a task whose step checks all pass but whose stored criteria fail is still recorded as failed.

## Done when

The model can author and run its own checks, they appear in evidence, and a test proves passing step checks cannot make a task successful when the given criteria are false.
