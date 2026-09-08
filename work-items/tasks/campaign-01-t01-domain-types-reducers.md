# CAMPAIGN-01-T01: Domain types and reducers

Status: done
Spec: **DOM-01** … **DOM-07**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L0**  
Expected paths: `src/durable/domain/**`

## Goal

Land pure domain vocabulary, records, lifecycle matrices, and reducers with an
import-boundary test. No SQLite, Pi, or Playwright.

## Discovery

- Inventory prototype fields in `src/jobs` + PlanStore/TaskStore/GoalStore; classify
  authority vs projection vs unused.
- Confirm sprint is not authoritative in V2.

## Fix

- Implement types from jobs-v2-spec §1.
- Job lifecycle and WorkItem reducers with illegal-transition throws.
- Derived display status helper (not stored).
- Cancel command shapes for Job and WorkItem.
- Import-boundary test: domain MUST NOT import Pi/Playwright/CLI/SQLite/Fabric/fs.

## Prohibited

- Persistence
- Spec compiler (01-T02)
- Adapter wiring

## Tests

- Every legal/illegal Job lifecycle transition
- WorkItem status command properties
- Display status never written to lifecycle
- Banned import lint/test

## Review focus

DOM-02 boundaries; no sprint authority; cancel present in domain API.

## Depends on

None (parallel with CAMPAIGN-00-T01).

## Done when

DOM-01..07 have L0 evidence; evaluation record + improvement pass complete.

## Supersedes

Partial scope of obsolete `campaign-01-t01-domain-spec-compiler.md` (domain half only).
