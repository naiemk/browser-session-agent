---
id: CAMPAIGN-R2-E1
title: Magpie CDP reconnect after control-client drop (L5)
story: CAMPAIGN-02
epic: v2-campaigns
status: done
---

# CAMPAIGN-R2-E1 — Magpie CDP reconnect (L5)

Spec: **EXEC-05**  
Authority: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md), [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md) §3.3, [`docs/release-roadmap.md`](../../docs/release-roadmap.md) R2.E1  
Evaluation: [`../evaluations/jobs-v2/campaign-r2-e1-magpie-cdp-reconnect.md`](../evaluations/jobs-v2/campaign-r2-e1-magpie-cdp-reconnect.md)  
Evidence minimum: **L5** (fixture login → control-client drop → reconnect → same auth + stale ref/tab reject). Do not claim L7.

## Goal

After Magpie drops its Playwright CDP client (`disconnect`), a **new** `BrowserWorker` +
`WorkerBrowserPort.adopt` reconnects via `worker.json` to the same Chromium profile.
Fixture login still authenticates. Pre-reconnect refs and unknown tabs fail closed.
Chromium stays alive across the client drop (`disconnect` ≠ `stop`).

## Fix

1. `BrowserWorker.disconnect()` drops the CDP client even when `launchedHere`, leaves
   Chromium + `worker.json`, and still allows later `stop()` to SIGKILL via pid.
2. Integration test: fixture `/login` → disconnect → second worker attach → `/jobs`
   still logged in; stale ref / unknown tab rejected.

## Out of scope

- R2.E3 L7 smokes
- Detaching Chrome from the Node process on Pi crash (residual P1)
- Wiring `ProfileEpochGuard` into `WorkerBrowserPort`
- `createLiveModel` / FakeKernel / durable CLI host

## Reviewer eval criteria (reject the PR if any fail)

1. **New control client.** New `BrowserWorker` + new `WorkerBrowserPort.adopt` after
   `disconnect()`; not the same port object.
2. **Same auth.** Fixture login still reaches `/jobs` (not bounced to `/login`).
3. **Stale fail-closed.** Pre-reconnect ref → `missing_ref`; unknown tabId → `missing_tab`.
4. **disconnect ≠ stop.** After disconnect, CDP `/json/version` still answers and
   `worker.json` remains; no SIGKILL of Chrome from disconnect alone.
5. **No overclaim.** No FakeKernel, no `createLiveModel`, no R2.E3 / R2 shipped.

## Done when

EXEC-05 L5 evidenced; evaluation + improvement pass; roadmap R2.E1 ticked (not R2.E3).
