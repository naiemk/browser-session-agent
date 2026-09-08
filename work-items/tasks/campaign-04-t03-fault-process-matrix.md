# CAMPAIGN-04-T03: Fault injection and process matrix

Status: done  
Spec: **MIGRATE-02** (proof half)  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md) §3  
Evidence minimum: **L4**, **L5**, **L6**

## Goal

Prove recovery across repository crashes, process kills, persistent profile reconnect, and
adapter contracts before cutover.

## Fix

- Layered test commands L0–L6
- Kill matrix: before model, between acts, after effect, before commit
- Persistent profile reconnect + stale ref rejection
- Adapter contract suite
- Label remaining prototype tests as below-boundary where honest

## Tests

- Every kill boundary → safe Effect/Attempt/WorkItem state
- Two due jobs contend for one browser safely
- Traceability scaffolding toward `results/jobs-v2/traceability.json`

## Depends on

CAMPAIGN-02-T04, CAMPAIGN-03-T02, CAMPAIGN-03-T03.

## Done when

MIGRATE-02 proof criteria for L4–L6 green; evaluation + improvement pass.

## Supersedes

Proof half of obsolete `campaign-04-t02-proof-and-cutover.md`.
