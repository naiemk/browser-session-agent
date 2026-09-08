# CAMPAIGN-01-T04: Prototype validator and importer

Status: done  
Spec: **STORE-06**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L1**, **L6** dry-run CLI  
Expected paths: `src/durable/infrastructure/prototype/**`

## Goal

Validate prototype job directories; import read-only or archive; never schedule malformed
records.

## Discovery

- Sample local prototype jobs; classify importable vs quarantine.
- Document fields that cannot map (sprints as authority, etc.).

## Fix

- Dry-run validator with structured report
- Best-effort importer into JobRepository (read-only activation policy)
- Archive path for unsupported/malformed
- CLI: `job prototype validate|import|archive` (or V2 equivalent) experimental

## Prohibited

- Mutating prototype as dual-write authority
- Scheduling imported malformed graphs
- Deleting operator evidence without archive

## Tests

- Clean / partial / revised / redacted / malformed fixtures
- Imported job not runnable until explicit V2 activation policy says so

## Review focus

STORE-06 quarantine honesty; no silent data loss.

## Depends on

CAMPAIGN-01-T03.

## Done when

STORE-06 evidenced; evaluation + improvement pass complete.
