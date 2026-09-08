# Evaluation: CAMPAIGN-01-T01

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: DOM-01 … DOM-07
Evidence level claimed: L0

## Discovery notes

- No `src/durable/` tree existed; Jobs V2 types lived only in docs.
- Prototype authorities: `JobRecord`, `SpecRecord`, `SprintRecord`, plan tasks, overlapping
  Goal/Plan/Task stores — sprint was authoritative in prototype.
- `src/domain/` is the interactive session domain, not Jobs V2.
- Cancel existed as a status union member in the prototype without a command API.
- Display statuses (`running`/`idle`) were conflated with durable job status historically.

## Changes

- `src/durable/domain/`: types, job lifecycle matrix, work-item command reducer, case
  upsert identity, errors, index exports.
- `src/durable/application/status.ts`: `deriveDisplayStatus` (never stored on lifecycle).
- `src/durable/application/commands.ts`: `CancelJob` / `CancelWorkItem` shapes (adapters
  later in CAMPAIGN-04-T01).
- Tests: `tests/unit/durable-domain.test.ts`, `tests/unit/durable-boundary.test.ts`.

## Commands run

```bash
npx tsx --test --test-concurrency=1 --test-timeout=120000 \
  tests/unit/durable-domain.test.ts \
  tests/unit/durable-boundary.test.ts
npm run typecheck
```

Evidence file: `results/jobs-v2/campaign-01-t01/targeted-tests.txt`.

## Senior review (fresh context)

| Area | Notes |
| --- | --- |
| Correctness | Full job lifecycle cartesian test; work-item command reducer; case upsert. |
| Boundaries | Domain import lint bans Pi/Playwright/CLI/SQLite/Fabric/`node:fs`. |
| Concurrency | N/A at L0 (no store). |
| Safety | Cancel shapes present; no grant/wildcard synthesis in domain. |
| Observability | IDs typed; display helper separate from lifecycle. |
| Perf/cost | Pure reducers only. |
| Test realism | Honest L0; adversarial illegal transitions covered. |
| Maintainability | Clear module split matching spec owners. |

Residual risks:

- P1: Work-item transition matrix is implementer-defined detail beyond the high-level
  statuses in the spec; revisit if CAMPAIGN-03 needs different edges.
- P2: Application cancel commands not yet wired to service/CLI/Pi (04-T01).

## Scorecard

| Category | Initial | After improvement | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | command applicability sweep + no Sprint export |
| Architectural boundaries | 4 | 4 | DOM-02 boundary test |
| Concurrency / crash | 2 | 2 | L0 only |
| Safety / privacy | 3 | 3 | cancel shapes; no I/O |
| Observability | 3 | 3 | display vs lifecycle |
| Performance / cost | 3 | 3 | pure |
| Test realism | 3 | 4 | exhaustive job matrix + command sweep |
| Maintainability | 3 | 3 | |

Hard gates: met.

## Improvement pass

- Exported `WORK_ITEM_COMMAND_TYPES` and added cross-status applicability enumeration.
- Asserted Sprint is not an authoritative domain type/export.

## Requirement coverage

| ID | Code | Test |
| --- | --- | --- |
| DOM-01 | `domain/types.ts` | vocabulary / no Sprint |
| DOM-02 | `domain/**` | durable-boundary |
| DOM-03 | `job-lifecycle.ts` | cartesian transitions |
| DOM-04 | `work-item.ts` | command reducer |
| DOM-05 | `case.ts` | upsert + duplicate assert |
| DOM-06 | `application/status.ts` | deriveDisplayStatus |
| DOM-07 | `cancelJob`/`cancelWorkItem` + command shapes | cancel tests |

## Open risks / follow-ups

- CAMPAIGN-01-T02 spec compiler next.
- Wire cancel adapters in CAMPAIGN-04-T01.
