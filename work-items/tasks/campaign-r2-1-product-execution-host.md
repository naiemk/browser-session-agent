---
id: CAMPAIGN-R2-1
title: Product ExecutionHost — Magpie DirectKernel, never FakeKernel
story: CAMPAIGN-04
epic: v2-campaigns
status: done
---

# CAMPAIGN-R2-1 — Product ExecutionHost (R2.1)

Spec: **EXEC-05**, **ADAPTER-02**, **ADAPTER-04**, **SCHED-02**  
Authority: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md), [`docs/release-roadmap.md`](../../docs/release-roadmap.md) R2.1  
Evaluation: [`../evaluations/jobs-v2/campaign-r2-1-product-execution-host.md`](../evaluations/jobs-v2/campaign-r2-1-product-execution-host.md)  
Evidence minimum: **L6** (adapters never FakeKernel-complete); **L2** injected DirectKernel + behavioral mock

## Goal

CLI and Pi durable adapters stop injecting a FakeKernel that returns `{ ok: true }`.
The only product ExecutionHost is Magpie `WorkerBrowserPort` + `runTask` behind
`DirectKernel`. Default remains off until a host is attached (`runtime_unavailable`,
never idle, never fake success).

## Fix

1. `src/durable/infrastructure/product-host.ts` — `runDurableAttempt` +
   `createProductExecutionHost` (null when worker or model missing).
2. CLI `durable tick` / `--due`: attach only with `BSA_DURABLE_HOST=1` or `--host`;
   Magpie `BrowserSession` + `createLiveModel`; fail closed to null on miss; close
   session after tick.
3. Pi `registerDurablePiCommands({ hostFactory })` — default `() => null`. No FakeKernel.
   Do **not** bind from `extension.ts` (that is R2.2).
4. Tick / stderr remediation names the miss (no Magpie worker, no model).

## Out of scope

- R2.2 Magpie/web bind of durable commands
- R2.3 / L7 challenge-approval live attach evidence
- R2.4 / MIGRATE-03 delete `src/jobs`
- R2.E1 Magpie CDP second-process reconnect

## Depends on

CAMPAIGN-02-T04, CAMPAIGN-04-T01.

## Done when

Adapters never import FakeKernel; L6 exit-4 without host; `BSA_DURABLE_HOST=1` without
model/worker still exit 4; injected product host + mock observes a fixture page;
evaluation record + roadmap R2.1 ticked (not R2.2 / R2.E1 / R2.E3).
