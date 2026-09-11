---
id: CAMPAIGN-R2-E4
title: Prototype import/archive dry-run (STORE-06)
story: CAMPAIGN-04
epic: v2-campaigns
status: done
---

# CAMPAIGN-R2-E4 — Prototype import/archive dry-run

Spec: **STORE-06**  
Authority: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md), [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md) §3 item 6, [`docs/release-roadmap.md`](../../docs/release-roadmap.md) R2.E4  
Evaluation: [`../evaluations/jobs-v2/campaign-r2-e4-prototype-dry-run.md`](../evaluations/jobs-v2/campaign-r2-e4-prototype-dry-run.md)  
Evidence: **L1 fixtures + L6 CLI**. No Chrome / LLM.

## Goal

`durable prototype import|archive --dry-run` reports the intended action without writing.
Malformed jobs never land in `ok` and never schedule. Unsupported (sprint authority) is
archive-only, not importable `ok`. Import stays `runnable: false`. Traceability STORE-06
points at real symbols + tests.

## Fix

1. `src/durable/infrastructure/prototype-import.ts` — gated import/archive + dry-run.
2. `validate.ts` — unsupported must not also push to `ok`.
3. CLI `--dry-run` on import/archive.
4. Fixtures + unit/CLI tests; tighten `traceability.json` STORE-06.

## Out of scope

R2.E3 L7, R2.E5/`src/jobs` delete, JobRepository writes, MIGRATE-02 hard cutover claim.

## Reviewer eval criteria (reject if any fail)

1. `--dry-run` import/archive writes nothing under archive dest.
2. Malformed never `ok`, never scheduled; import exits nonzero.
3. Unsupported (sprint) is not importable `ok`; archive-only.
4. `runnable` stays `false`.
5. `traceability.json` STORE-06 points at `prototype-import.ts` + new tests.
6. No R2.E5 / `src/jobs` delete.

## Done when

STORE-06 dry-run evidenced; evaluation + improvement pass; roadmap **R2.E4** ticked only.
