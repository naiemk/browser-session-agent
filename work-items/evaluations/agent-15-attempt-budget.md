# Evaluation: AGENT-15

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: FailureStage + no-progress breakers (challenge-and-approval-handling); EXEC retry ledger parity
Evidence: L0/L1 unit canaries

## Discovery

- Durable already had `FailureStage` and `allowRetry` no-new-evidence.
- Interactive/runtime lacked a host-neutral attempt budget tracker.

## Changes

- `src/runtime/attempt-budget.ts` — chain IDs, stages, evidence/strategy gates, exhausted → blocked.takeover checkpoint
- Unit tests align with durable `allowRetry`

## Spec validation

| Requirement | Status |
| --- | --- |
| Typed failure stages | Pass |
| Stable retry-chain IDs | Pass |
| Reject identical retry | Pass |
| Max attempts / elapsed | Pass |
| Checkpoint on budget end | Pass (`blocked.takeover`) |
| Durable ledger parity | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Exhausted returns checkpointed block |
| Boundaries | 4 | 4 | Host-neutral module |
| Concurrency | 3 | 3 | In-memory tracker |
| Observability | 3 | 3 | Stage counters on record |
| Test realism | 3 | 3 | |
| Maintainability | 4 | 4 | |

## Improvement pass

Changed exhausted outcome from bare `failed` to `blocked.takeover` with checkpoint + hint.

## Residual

- Wire tracker into every interactive tool call path (not only durable allowRetry).
- Berlin stage totals replay still open.
- Live before/after unsuccessful-action rate deferred.
