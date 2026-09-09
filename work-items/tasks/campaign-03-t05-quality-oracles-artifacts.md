# CAMPAIGN-03-T05: Quality oracles and artifacts

Status: done  
Spec: **QUALITY-01** … **QUALITY-04**, **EXEC-09**, **SPEC-03**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L2**  
Maps: QUAL-02, QUAL-03, QUAL-04, QUAL-06 infrastructure

## Goal

Typed outputs, artifact manifests, AggregateOracle job completion, optional independent
review operation template. Do **not** close QUAL-01/QUAL-05.

## Fix

- outputSchema validation before case advance (QUALITY-01)
- Artifact manifests + drift detection (QUALITY-02)
- AggregateOracle completion path (QUALITY-03 / SPEC-03)
- Optional review OperationTemplate support (QUALITY-04)
- Evaluator never trusts model claim alone (EXEC-09)

## Tests

- Complete-looking page fails without durable accepted outputs
- Manifest hash mismatch reported
- Review template instantiates without domain hardcoding

## Depends on

CAMPAIGN-03-T01.

## Done when

QUALITY-01..04 evidenced at L2; QUAL-01/05 explicitly left open; evaluation + improvement.

## Supersedes

Oracle half of obsolete `campaign-03-t01-case-workflows-oracles.md`.
