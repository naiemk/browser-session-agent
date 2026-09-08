# AGENT-06: Built to yield, not to finish

Status: done for bounded-attempt primitives; durable integration is CAMPAIGN-03

As a durable-work engine, I can stop a bounded attempt with a typed checkpoint because
stopping is a normal outcome and session text is not workflow truth.

## Acceptance criteria

- `parked` is a normal task outcome carrying reason, wake source (`timer`, `third_party`, `human`), perishability, and the payload a human would need to act on it.
- Parking is per entity: one parked entity does not stop unrelated work.
- Durable state is entity-oriented, with a stable entity id and an `idempotencyKey` per consequential action.
- A guarded action whose idempotency key already exists is refused as a duplicate.
- A fresh process can reconstruct a partway task from durable input; production
  persistent-profile and uncertain-effect recovery are proved in CAMPAIGN-02/03.
- No scheduler, queue UI, or notification channel is built here; this is the state shape only.

## Decisions

D31 (the three forward-compatibility locks), D32 (blocks park and batch rather than interrupt), D27 (session memory is a within-day optimization, never the source of truth).

## Tasks

- [AGENT-06-T01](../tasks/agent-06-t01-park-and-entity-state.md)

## Tests

`tests/unit/agent-park-state.test.ts`, `tests/e2e/agent-06-cold-resume.test.ts`.
