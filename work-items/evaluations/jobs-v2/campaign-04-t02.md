# Evaluation: CAMPAIGN-04-T02

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: OBS-01..04
Evidence level claimed: L2

## Discovery notes

See epic index and `docs/jobs-v2-spec.md`. Built atop CAMPAIGN-00/01-T01 domain quarantine.

## Changes

Turn attribution, wall buckets, phase capabilities

## Commands run

```bash
npx tsx --test tests/unit/durable-*.test.ts tests/integration/durable-*.test.ts tests/e2e/job-quarantine.test.ts
npm run typecheck
```

Evidence: `results/jobs-v2/campaign-batch/targeted-tests.txt` (38 pass).

## Senior review

Residual risks documented in CAMPAIGN-04-T04: L5 Magpie reconnect and L7 live smokes still operator-gated; prototype `src/jobs` retained under quarantine (soft cutover).

## Scorecard

| Category | Initial | After improvement | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 3 | |
| Architectural boundaries | 3 | 3 | |
| Concurrency / crash | 2 | 3 | fence/uncertain paths |
| Safety / privacy | 3 | 3 | |
| Observability | 2 | 3 | |
| Performance / cost | 2 | 3 | |
| Test realism | 3 | 3 | |
| Maintainability | 3 | 3 | |

Hard gates: met for automated evidence ceiling of this ticket.

## Improvement pass

Added/extended adversarial tests for fencing, challenge non-completion, scheduler runtime_unavailable, and compiler grant rejection beyond the first green path.

## Requirement coverage

OBS-01..04 → code under `src/durable/**` + durable tests.

## Open risks / follow-ups

- Real WorkerBrowserPort L5 reconnect (02-T04 evidence uplift)
- Two L7 controlled live smokes before hard-deleting `src/jobs` (04-T04)
- Wire AGENT-13/14/15 production detectors into ChallengeDetector/gate adapters
