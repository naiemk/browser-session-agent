---
id: CAMPAIGN-R2-2
title: Bind durable commands in Magpie chat and hosted command bar
story: CAMPAIGN-04
epic: v2-campaigns
status: done
---

# CAMPAIGN-R2-2 — Magpie / hosted bind of Jobs V2 commands

Spec: **ADAPTER-01**, **ADAPTER-02**, **ADAPTER-03**, **ADAPTER-04**, **SCHED-02**  
Authority: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md), [`docs/release-roadmap.md`](../../docs/release-roadmap.md) R2.2  
Evaluation: [`../evaluations/jobs-v2/campaign-r2-2-magpie-web-bind.md`](../evaluations/jobs-v2/campaign-r2-2-magpie-web-bind.md)  
Evidence minimum: **L6** (FakePi Magpie bind + hosted command dispatch). Do not claim L5/L7.

## Goal

In Magpie chat, `/durable-status`, `/durable-tick`, `/durable-cancel` drive SQLite V2 on
**this** browser and a live env-key model. Missing worker or model →
`runtime_unavailable`, never FakeKernel. Hosted chat shows the same commands; ticks fail
closed (no in-process `BrowserWorker`). Prototype `/job-*` stays labeled prototype.

## Fix

1. `src/host/pi-durable.ts` — `bindDurableCommands` + `magpieDurableHostFactory`.
2. Magpie (`src/extension.ts`): `hostFactory` uses `session.worker` when `workerInfo` is
   set, plus cached `createLiveModel()`. Do not `worker.start()` from status or a missing
   worker. Do not use CLI `durable/magpie-host`.
3. Hosted (`src/hosts/web/runtime.ts`): same commands, `hostFactory` always `() => null`.
   Command bar in `src/hosts/web/public/app.js`.
4. Overlay Magpie/hosted remediation on `runtime_unavailable` (do not leave the CLI
   `--host` sentence as the only copy).

## Out of scope

- R2.E1 CDP reconnect / R2.E3 L7 smokes
- R2.3 challenge-approval live attach
- R2.4 / MIGRATE-03 delete `src/jobs`
- RPC ExecutionHost wrapping `RpcSessionHandle`
- Auto-tick, job-invoked coach (AGENT-16-T04), R1.E2 live run

## Depends on

CAMPAIGN-R2-1, CAMPAIGN-04-T01.

## Reviewer eval criteria (reject the PR if any fail)

1. **Same Chrome as chat.** Magpie ticks use `session.worker`, not a second
   `BrowserSession` / `durable/magpie-host`. CLI `--host` isolation stays CLI-only.
2. **No surprise Chrome.** `/durable-status` and a missing worker must not call
   `worker.start()`. Tick without a started worker is `runtime_unavailable`.
3. **Never FakeKernel-complete.** Null host → `runtime_unavailable` + remediation.
   Source scan includes `extension.ts`, `hosts/web/runtime.ts`, `host/pi-durable.ts`.
4. **Two model loops, one browser.** Durable attempt is `runTask` + `createLiveModel`
   (env keys), not the Pi conversation. Missing env keys → no-model remediation. Do not
   invent a Pi-session `ModelPort`. Unit tests must not call `createLiveModel`.
5. **Hosted ticks fail closed.** Do not wrap `RpcSessionHandle` as `BrowserWorker`.
   Command bar + SQLite status/cancel are the web surface.
6. **Chat does not bind a job.** `durableChatBinding().boundJobId` stays `undefined`.
7. **Prototype stays.** Do not remove `/job-*` or rename durable commands to `/job-*`.
8. **Do not claim R2 shipped.** No R2.E1, R2.E3, R2.4, AGENT-16-T04, or R1.E2 in this eval.
9. **coreRoot honesty.** Magpie laptop SQLite and hosted API SQLite are different
   processes. Do not sync DBs.
10. **Command names.** Keep `durable-status` / `durable-tick` / `durable-cancel` (including
    `durable-tick --due`). No fourth command.

## Tests

- FakePi: Magpie bind registers the three commands; empty args error; prototype
  `job-new` still present; `durableChatBinding().boundJobId` undefined
- Magpie factory: no `workerInfo` → null; worker+mock stream → non-null host
- FakePi `/durable-tick <id>` with null host notifies `runtime_unavailable`
- FakeKernel import scan includes new bind files
- `app.js` lists the three durable commands

## Done when

Cited ADAPTER/SCHED IDs evidenced at L6; evaluation + improvement pass; roadmap R2.2
ticked (not R2 shipped / R2.E1 / R2.E3).
