---
id: CAMPAIGN-R2-E2
title: Hosted/RPC ExecutionHost twin
story: CAMPAIGN-04
epic: v2-campaigns
status: done
---

# CAMPAIGN-R2-E2 — Hosted/RPC ExecutionHost twin

Spec: **EXEC-05**, **ADAPTER-02**, **ADAPTER-04**, **SCHED-02**  
Authority: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md), [`docs/release-roadmap.md`](../../docs/release-roadmap.md) R2.E2  
Evaluation: [`../evaluations/jobs-v2/campaign-r2-e2-hosted-rpc-host.md`](../evaluations/jobs-v2/campaign-r2-e2-hosted-rpc-host.md)  
Evidence minimum: **L6** (FakePi hosted bind + OperatorRuntime) and **L2** (`RpcBrowserPort` through JSON `dispatchPortRpc`). Do not claim L5/L7.

## Goal

Hosted chat `/durable-tick` drives Jobs V2 through the same `DirectKernel` + `runDurableAttempt`
path as Magpie, using **`RpcBrowserPort`** over the existing node-agent wire when the desktop
node is connected and an env-key model is ready. Disconnected node or missing model →
`runtime_unavailable`, never FakeKernel. Do **not** wrap `RpcSessionHandle` as `BrowserWorker`.

## Fix

1. `createProductExecutionHost` / `createPersistentExecutionHost` accept a `BrowserPort`
   (RPC) as well as a Magpie `BrowserWorker`.
2. `hostedDurableHostFactory` in `src/host/pi-durable.ts`: null unless `connected()` and
   a live model / test stream exist.
3. Hosted `OperatorRuntime`: one `RpcBrowserPort` shared by chat tools and durable ticks;
   `nodeConnected` is `hub.connected`; challenge takeover uses `RpcSessionHandle.takeover`.
4. Remediation names disconnected node vs missing model. Prototype `/job-*` stays.

## Out of scope

- R2.E3 L7 smokes / R2.3 challenge-approval live attach
- R2.4 / MIGRATE-03 delete `src/jobs`
- R2.E1 Magpie CDP reconnect (already landed)
- R2.E4 prototype import dry-run
- Auto-tick, job-invoked coach (AGENT-16-T04), R1.E2 live run
- Treating Magpie laptop SQLite and hosted API SQLite as one store

## Depends on

CAMPAIGN-R2-2, CAMPAIGN-R2-1.

## Reviewer eval criteria (reject the PR if any fail)

1. **BrowserPort, not BrowserWorker.** Hosted host is `RpcBrowserPort`. Source must not pass
   `RpcSessionHandle.worker` (or `handle.worker`) into `createProductExecutionHost`.
2. **Fail closed.** Tick with `hub.connected === false` or no model is `runtime_unavailable`
   plus surface remediation. Never FakeKernel-complete.
3. **Two model loops, one browser.** Durable attempt is `runTask` + `createLiveModel` (env
   keys), not the Pi conversation. Unit tests must not call `createLiveModel`.
4. **No surprise Chrome on the API.** `/durable-status` and a disconnected node must not
   invent a local Chromium. Desktop lazy-start via node-agent port RPC is the product path.
5. **Same Chrome as hosted chat.** Chat `composeAgent` and durable ticks share one
   `RpcBrowserPort` instance.
6. **Chat does not bind a job.** `durableChatBinding().boundJobId` stays `undefined`.
7. **Prototype stays.** Do not remove `/job-*`.
8. **Do not claim R2 shipped.** No R2.E3, R2.4, AGENT-16-T04, or R1.E2 in this eval.
9. **coreRoot honesty.** Do not sync Magpie and hosted DBs.
10. **Command names.** Keep `durable-status` / `durable-tick` / `durable-cancel`.

## Tests

- `hostedDurableHostFactory`: disconnected → null; connected without model → null;
  connected + stream → host `profileKey: hosted-rpc`
- FakePi hosted tick disconnected → `runtime_unavailable` + node remediation
- FakePi hosted tick connected + mock stream → not `runtime_unavailable`
- OperatorRuntime + disconnected `NodeHub` → node remediation (production bind)
- L2: JSON `RpcBrowserPort` + `dispatchPortRpc(LocalBrowser)` + behavioral mock observes
  fixture `/apply` through `JobApplicationService.tick`
- FakeKernel import scan includes bind files; no `handle.worker` host construction

## Done when

Cited IDs evidenced at L6/L2; evaluation + improvement pass; roadmap R2.E2 ticked
(not R2 shipped / R2.E3).
