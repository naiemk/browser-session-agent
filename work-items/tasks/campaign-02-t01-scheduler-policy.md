# CAMPAIGN-02-T01: Pure SchedulerPolicy

Status: done  
Spec: **SCHED-01** … **SCHED-08**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L0**, **L3** for multi-job busy skip  
Expected paths: `src/durable/domain/scheduler-policy.ts`

## Goal

Deterministic pure eligibility decisions with typed ineligibility reasons, budgets,
fairness, and nextWakeAt — no I/O.

## Fix

- `decide(state, now)` pure (SCHED-01)
- `runtime_unavailable` vs `idle` (SCHED-02)
- Dependencies, deferred, breakers, budgets, human blocks, fairness (SCHED-03)
- Real site-action budget semantics (SCHED-04)
- nextWakeAt min of timers (SCHED-05)
- Human-only ineligibility ignoring timer (SCHED-06)
- Read-only batch eligibility rules (SCHED-07)
- Busy job does not abort due scan (SCHED-08) — policy + application scan contract

## Tests

- FakeClock boundaries
- Property: blocked/terminal never dispatched
- Two-job busy skip
- Replay: Berlin-style host breaker stops repeats

## Depends on

CAMPAIGN-01-T01.

## Done when

SCHED-01..08 evidenced; evaluation + improvement pass complete.

## Supersedes

Obsolete `campaign-02-t01-scheduler-resources.md`.
