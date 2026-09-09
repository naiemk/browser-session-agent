# CAMPAIGN-04-T02: Telemetry, attribution, phase routing

Status: done  
Spec: **OBS-01** … **OBS-04**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L2**, live hooks for PERF-01 verification  
Maps: PERF-01, PERF-02, PERF-06 (context already in 02-T03), PERF-07, PERF-08, PERF-10

## Goal

Per-turn model attribution, wall-time decomposition, cost-per-accepted-case reporting,
phase-scoped capabilities. Cost does not fail CI alone.

## Fix

- provider/model/phase/attemptId on every turn (OBS-01)
- queue/pacing/unavailable/human/challenge/browser/model/evaluation/review timers (OBS-02)
- cost per attempted/completed/verified/accepted (OBS-03)
- phase tool schema scoping; routing hooks after PERF-01; fix duplicate-work metrics if
  used (OBS-04)

## Explicitly out of scope

- PERF-03 Fabric adoption
- PERF-04/05/09 perception/navigation (OBS-05)

## Tests

- Mid-run model switch attributed correctly in metrics
- Wall-time buckets sum ≈ total within tolerance
- Capability set changes by phase without last-writer-wins regression

## Depends on

CAMPAIGN-02-T03.

## Done when

OBS-01..04 evidenced; evaluation + improvement pass; open PERF items updated not falsely
closed.
