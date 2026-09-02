---
id: AGENT-03-T01
title: Task criteria come from outside the executor
story: AGENT-03
epic: agent
status: todo
---

# AGENT-03-T01 — Task criteria come from outside the executor

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D20 (external immutable criteria), D17 (harness accepts actions)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — an oracle the agent cannot fake

## Possible

All references below are **shape only**; the implementation is written fresh in the new core (D34).

- `src/domain/verification.ts` — old `evaluateExpectation` and `VerificationCheck`
- `src/plan/evaluate.ts` — old code-only predicate evaluator
- AGENT-00-T01 — the new action choke point where criteria attach

## Do

1. Define `Criterion` as a predicate program evaluated in code in the new core. No model call in the evaluation path.
2. Attach criteria to a task at creation, from the suite definition or the caller. Store them with the run so a resume re-reads the same criteria.
3. Make them immutable to the executor: the criteria the agent is told about are a copy, and the evaluated set comes from stored task state, never from a tool argument.
4. A task cannot be reported successful unless its stored criteria evaluate true against a fresh observation.
5. Surface criteria to the model as text so it knows the target, while keeping the evaluated copy out of reach.

## Tests

- `tests/unit/agent-criteria.test.ts` — criteria evaluate in code with no model; a stored criterion cannot be overwritten through any tool argument; success is refused when criteria are false even if the executor claims completion.
- `tests/e2e/agent-03-criteria.test.ts` — on the `/apply` fixture, a run that submits nothing but claims success is recorded as failed; a run that genuinely submits passes.

## Done when

Task success is decided only by criteria supplied with the task and evaluated in code. A test proves an executor claiming success against false criteria is recorded as a failure. Both test files are in the `npm test` glob.
