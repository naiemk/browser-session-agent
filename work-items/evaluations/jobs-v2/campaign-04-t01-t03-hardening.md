# Evaluation: CAMPAIGN-04-T01 / T03 hardening

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: ADAPTER-01..04, SCHED-02, MIGRATE-02 kill matrix
Evidence: L6 FakePi/CLI contracts; L6 real SIGKILL process matrix

## Discovery

- Prior 04-T03 evidence was in-process fence/uncertain sims only.
- No FakePi durable commands; CLI due/tick exit-4 covered partially elsewhere.

## Changes

- `src/durable/adapters/pi.ts` — durable-status/tick/cancel; no chat bind
- `tests/helpers/durable-kill-child.ts` — staged hang + marker for parent SIGKILL
- `tests/integration/durable-adapters-kill.test.ts` — FakePi + CLI exit 4 + four kill boundaries

## Spec validation

| Requirement | Status |
| --- | --- |
| Fresh chat unbound | Pass |
| Explicit job id commands | Pass |
| Due/tick without host ≠ idle 0 | Pass (exit 4) |
| SIGKILL before_model | Pass |
| SIGKILL between_acts | Pass |
| SIGKILL after_effect | Pass |
| SIGKILL before_commit | Pass |
| No forged done work items | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Real process kills |
| Concurrency / crash | 2 | 4 | Beyond fence sims |
| Test realism | 2 | 4 | SIGKILL child |
| Boundaries | 4 | 4 | Thin Pi adapter |
| Maintainability | 3 | 3 | |

## Improvement pass

Ensured CLI test creates `durable/` before opening SQLite (open-database failure).

## Residual

- Magpie CDP reconnect still covered by 02-T04 epoch guard + operator path
- L7 live smokes still block hard delete of `src/jobs`
