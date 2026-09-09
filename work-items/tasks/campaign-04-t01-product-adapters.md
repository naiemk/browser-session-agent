# CAMPAIGN-04-T01: Pi, CLI, web, due adapters

Status: done  
Spec: **ADAPTER-01** … **ADAPTER-04**, **DOM-06**, **DOM-07**, **SCHED-02**, **SCHED-08**  
Evaluation: [`../evaluations/jobs-v2/campaign-04-t01-t03-hardening.md`](../evaluations/jobs-v2/campaign-04-t01-t03-hardening.md)  
Evidence minimum: **L6**

## Goal

Thin adapters over JobApplicationService with truthful statuses and cancel/due behavior.

## Fix

- All mutations via application service (ADAPTER-01)
- Honest strings (ADAPTER-02)
- Explicit bind only (ADAPTER-03) — `durableChatBinding().boundJobId` undefined
- Due tick constructs host or runtime_unavailable nonzero (ADAPTER-04, SCHED-02)
- Pi adapter: `durable-status` / `durable-tick` / `durable-cancel`
- Derived display statuses (DOM-06)
- Cancel commands (DOM-07)
- Due scan continues past busy (SCHED-08)

## Tests

- FakePi + CLI process contract suite (`tests/integration/durable-adapters-kill.test.ts`)
- Fresh chat does not bind job
- Due without host ≠ idle exit 0 (exit 4)

## Depends on

CAMPAIGN-02-T04, CAMPAIGN-03-T04.

## Done when

Cited ADAPTER/DOM/SCHED IDs evidenced; evaluation + improvement pass.

## Note

Replaces the adapter scope of the prior `campaign-04-t01-product-adapters.md` file (this
file is the active ticket). Telemetry moved to CAMPAIGN-04-T02.
