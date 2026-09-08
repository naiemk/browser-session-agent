# CAMPAIGN-03-T04: Human decisions and headed rehydration

Status: done  
Spec: **HUMAN-04** … **HUMAN-06**, **EFFECT-04**, **SCHED-06**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L5**, **L6**  
Cross-epic: AGENT-13-T03

## Goal

Async human collaboration: durable answers compile into retry context; perishable
rehydration verifies via oracle; unresolved human-only work never timer-wakes.

## Fix

- Headed rehydration + takeover + re-observe + oracle (HUMAN-04)
- Decision/approval answers → structured context / grants (HUMAN-05)
- Batch by kind; one live challenge at a time (HUMAN-06)
- Scheduled blocked.approval releases leases (EFFECT-04)
- SCHED-06 ineligibility

## Tests

- FakeClock: unresolved challenge never wakes
- UI resolved alone does not complete
- Approval answer creates one bounded grant

## Depends on

CAMPAIGN-03-T02, CAMPAIGN-03-T03, CAMPAIGN-02-T04.

## Done when

Cited HUMAN/EFFECT/SCHED IDs evidenced; evaluation + improvement pass.

## Supersedes

Human portion of obsolete `campaign-03-t02-effects-human-challenges.md`.
