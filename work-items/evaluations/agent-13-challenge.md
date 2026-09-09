# Evaluation: AGENT-13 (T01 + T02)

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: challenge detection → `blocked.challenge` (docs/challenge-and-approval-handling.md); durable EXEC blocked path
Evidence: L0/L1 unit fixtures; behavior gated by `BSA_CHALLENGE_BEHAVIOR=1`

## Discovery

- No prior `ChallengeDetector`; durable already had `openChallenge` + resource breaker on confidence.
- Spec requires pure classifier, telemetry-first, then high-confidence override of URL success.

## Changes

- `src/runtime/challenge-detector.ts` — pure signals, detector version, telemetry helper
- `src/runtime/resource-coordinator.ts` — host/session/profile breakers + `applyChallengeOutcome`
- `src/durable/application/dispatcher.ts` — post-execute classify; telemetry always; behavior when env set
- Tests: `tests/unit/agent-13-challenge.test.ts`

## Spec validation

| Requirement | Status |
| --- | --- |
| Pure classifier over redacted evidence | Pass |
| Lone 403 ≠ high confidence | Pass |
| Strong template / multi-signal → high | Pass |
| Telemetry without behavior by default | Pass (`BSA_CHALLENGE_BEHAVIOR` off) |
| High confidence → `blocked.challenge` | Pass when behavior on |
| Host breaker + resume needs new evidence | Pass |
| Session distinct-host budget | Pass |
| Vendor names not in branching | Pass |

## Senior review

| Category | Initial | After fix | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Resume same-hash now fails closed |
| Boundaries | 4 | 4 | Runtime module; durable wires optionally |
| Concurrency | 3 | 3 | In-memory coordinator; durable also persists resource row |
| Safety | 4 | 4 | No raw page body in telemetry |
| Observability | 3 | 4 | `challenge_candidate` JSON line |
| Perf/cost | 3 | 3 | |
| Test realism | 3 | 3 | Fixture signals; live corpus still QUAL |
| Maintainability | 4 | 4 | |

Hard gates: met for instrumentation + gated behavior.

## Improvement pass

Fixed `tryResume` evidence-hash persistence (was not written on first challenge).

## Residual

- Precision/recall on labeled Berlin corpus (T01 evidence thresholds) still need fixture corpus labeling.
- AGENT-13-T03 handoff/resume is implemented behind `BSA_CHALLENGE_BEHAVIOR` (default off).
  See `work-items/evaluations/agent-13-t03-handoff.md`.
- In-process ResourceCoordinator is not yet the shared durable persistence port across workers.
