# CAMPAIGN-02: Scheduling and persistent execution

Status: todo  
Normative: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md) SCHED-*, EXEC-*  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)

As an operator, a due job either runs one bounded attempt in my persistent browser or
reports exactly why it cannot; it never claims to be idle because no runtime was attached.

## Acceptance criteria

- Scheduling policy is deterministic, pure, and independent of Pi, CLI, browser, and model
  construction.
- Work is claimed atomically with expiring leases, renewal, and fencing tokens.
- Resource budgets and breakers are shared at their true profile/host/account scope.
- An execution host supplies model, persistent `BrowserPort`, cancellation, clock, and
  metrics through one port.
- Every attempt has finite turn, browser-action, elapsed-time, and effect budgets.
- A fresh process reconnects to the persistent browser and reconciles state before acting.
- Missing model/browser configuration is `runtime_unavailable`, not `idle`.

## Tasks

- [CAMPAIGN-02-T01](../tasks/campaign-02-t01-scheduler-policy.md) — SCHED-01..08
- [CAMPAIGN-02-T02](../tasks/campaign-02-t02-leases-fencing.md) — EXEC-01..03,08
- [CAMPAIGN-02-T03](../tasks/campaign-02-t03-context-outcome-evaluator.md) — EXEC-04,06,07,09
- [CAMPAIGN-02-T04](../tasks/campaign-02-t04-persistent-execution-host.md) — EXEC-01,05
- [CAMPAIGN-R2-E1](../tasks/campaign-r2-e1-magpie-cdp-reconnect.md) — Magpie CDP reconnect (L5)

## Done when

Each task has a closed evaluation record; fake-clock fairness and budget tests pass; an
in-flight lease cannot be stolen while heartbeats continue; a stale writer is fenced; a
spawned second process executes a due fixture through the persistent-browser adapter.
