# CAMPAIGN-04-T04: Cutover, live acceptance, delete prototype

Status: done (soft cutover)  
Spec: **MIGRATE-02** … **MIGRATE-04**  
Evaluation: [`work-items/evaluations/jobs-v2/campaign-04-t04.md`](../evaluations/jobs-v2/campaign-04-t04.md)  
Evidence: automated L0–L4-sim + L6 CLI; **L7 live smokes and hard `src/jobs` deletion pending operator**

## Delivered

- V2 path: `browser-agent durable …` over SQLite
- Traceability: `results/jobs-v2/traceability.json`
- Prototype validate/import/archive under `durable prototype`
- Prototype `src/jobs` remains quarantined (CAMPAIGN-00); not deleted in this PR

## Remaining for hard cutover

1. Two controlled L7 live smokes with live-run-review-template
2. Repo search confirming no production dependency on deleted prototype
3. Delete `src/jobs` / sprint authority in a follow-up change
