# CAMPAIGN-03-T01: Cases, materialization, revision

Status: done  
Spec: **CASE-01** … **CASE-05**, **DOM-05**, **SPEC-05**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L1**, **L2**  
Expected paths: `src/durable/application/materialize.ts`, revision activation

## Goal

Idempotent case upsert, per-case template graphs, spec-hash pinning, explicit revision
migration.

## Fix

- Seed materialization once (CASE-01)
- Discovery upsert + case graph (CASE-02, DOM-05)
- WorkItem.specHash immutable (CASE-03)
- RevisionMigration retain/map/cancel_rebuild/archive (CASE-04)
- Strategy substitution without weaker criteria (CASE-05)

## Tests

- Duplicate discovery → one case
- Revision cannot run old work under new envelope without plan
- Dependencies respected

## Depends on

CAMPAIGN-01-T02, CAMPAIGN-01-T03.

## Done when

Cited CASE/DOM/SPEC IDs evidenced; evaluation + improvement pass.

## Supersedes

Case/revision half of obsolete `campaign-03-t01-case-workflows-oracles.md`.
