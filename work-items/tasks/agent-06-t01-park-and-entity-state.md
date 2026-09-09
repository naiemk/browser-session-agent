---
id: AGENT-06-T01
title: Park as a normal outcome, entity state, cold resume
story: AGENT-06
epic: agent
status: todo
---

# AGENT-06-T01 — Park as a normal outcome, entity state, cold resume

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D31 (three forward-compatibility locks), D32 (help is queued), D27 (session is a within-day optimization)
- [docs/long-running-jobs.md](../../docs/long-running-jobs.md) — how the durable-work
  engine consumes this attempt-level contract

## Possible

- `src/domain/types.ts` — `RunState`, `RunStatus`, `AttentionItem`, `awaiting_takeover`
- `src/store/run-store.ts` — `state.json`, `events.jsonl`
- `src/session.ts` — `pauseRun`, `takeover`, `resume`

## Do

1. Add `parked` as a normal task outcome carrying `reason`, `wake` (`timer` | `third_party` | `human`), `perishable: boolean`, and the payload a human would need to act.
2. Parking is per entity, not per run. A parked entity must not stop other work; today's `awaiting_takeover` whole-run status stays only as a legacy alias.
3. Attempt state becomes entity-oriented with stable identity and an `idempotencyKey`.
   This suppresses known duplicates but does not claim certainty across an ambiguous
   external-effect crash window; CAMPAIGN-03 adds that journal and reconciliation.
4. Cold reconstruction: task input on disk must be sufficient to create a fresh attempt
   with no session context. Production process/profile recovery is a CAMPAIGN-02/04 gate.
5. Do not build a scheduler, queue UI, or notification channel. This task is the state shape only.

## Tests

- `tests/unit/agent-park-state.test.ts` — a parked outcome round-trips through disk with reason, wake source, and perishability; two entities can be parked independently while a third stays active; an action guarded by an existing `idempotencyKey` is refused as a duplicate.
- `tests/e2e/agent-06-cold-resume.test.ts` — a task is driven partway, the process is torn down, and a fresh process resumes from disk and completes; the previously completed committing action is not repeated.

## Done when

`parked` is a first-class attempt outcome with wake and perishability, state is
entity-oriented with idempotency keys, and bounded reconstruction tests pass. Production
exactness claims are deferred to the durable effect/reconciliation tests. Both test files
are in the `npm test` glob.
