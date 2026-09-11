# Evaluation: CAMPAIGN-R2-E4 (prototype dry-run)

Date: 2026-09-11
Implementer: Auto (Composer)
Spec IDs: STORE-06
Evidence: L1 fixtures + L6 CLI. Do not claim L7 / MIGRATE-02 hard cutover.
Commit: (this PR)

## Discovery

- `validatePrototypeRoot` pushed sprint-authority jobs into both `unsupported` and `ok`.
- `archivePrototypeJob` always wrote `ARCHIVE.json`; no `--dry-run`.
- `importPrototypeReadOnly` did not validate first; bad JSON threw instead of quarantine.
- Spec owner `prototype-import.ts` did not exist; only `prototype/validate.ts`.
- Fixtures from CAMPAIGN-01-T04 were never added; one empty-root validate test only.
- Coarse `traceability.json` STORE-06 pointed at `src/durable/**` globs.

## Implementation summary

- `src/durable/infrastructure/prototype-import.ts` — gated import/archive + dry-run.
- `validate.ts` — unsupported no longer lands in `ok`.
- CLI `--dry-run` on `durable prototype import|archive`; refuse exit 3.
- Fixtures under `tests/fixtures/prototype-jobs/**` + unit/CLI tests.
- Traceability STORE-06 tightened; MIGRATE-02 marked partial (item 6 done, L7 open).

## Initial evidence

```bash
npx tsx --test tests/unit/durable-prototype-import.test.ts
```

6 pass / 0 fail.

Highest evidence level claimed: **L6** (CLI) / **L1** (fixtures).

## Spec validation

| Requirement | Status |
| --- | --- |
| STORE-06 validate / import read-only / archive | Pass |
| Malformed not scheduled | Pass (class malformed, exit 3, no write) |
| Dry-run writes nothing | Pass |
| Unsupported archive-only (not ok) | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Added live archive refuse for malformed (improvement) |
| Boundaries | 4 | 4 | No JobRepository; runnable false |
| Concurrency / crash | 3 | 3 | FS-only |
| Safety / privacy | 3 | 3 | Quarantine honesty |
| Observability | 3 | 4 | Structured class / dryRun / wrote fields |
| Perf/cost | 4 | 4 | No Chrome/model |
| Test realism | 2 | 4 | Real fixtures + CLI commandDurable |
| Maintainability | 3 | 4 | Spec owner path exists |

## Improvement pass

- Added adversarial test: non-dry-run archive of malformed writes nothing and returns
  `class: malformed` (closes a hole where only dry-run was checked for quarantine).

## Requirement coverage

STORE-06 → `prototype-import.ts`, `prototype/validate.ts`, `adapters/cli.ts`,
`tests/unit/durable-prototype-import.test.ts`.

## Open risks / follow-ups

- R2.E3 L7 / R2.E5 delete still open
- MIGRATE-02 hard cutover **not** claimed
- Low-level `validate.ts` still exports write helpers for the import module; CLI uses
  the gated facade only
