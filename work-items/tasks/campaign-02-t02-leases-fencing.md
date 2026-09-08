# CAMPAIGN-02-T02: Leases, heartbeat, fencing, cancellation

Status: done  
Spec: **EXEC-01** (lease parts), **EXEC-02**, **EXEC-03**, **EXEC-08**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L1**, **L4**  
Expected paths: `src/durable/application/dispatcher.ts` (lease), repository claim/heartbeat

## Goal

Atomic work + profile leases with renewal, fencing tokens, cancellation, and stale-writer
rejection.

## Fix

- claim with FenceToken
- heartbeat ≤ TTL/3; default TTL 120s
- reject wrong fence on commit
- cancel stops tools; commit only with valid fence

## Tests

- Long fake attempt renews; competitor cannot steal
- Kill/restart at lease boundaries
- Stale writer rejected

## Depends on

CAMPAIGN-01-T03.

## Done when

EXEC-02,03,08 (+ lease portion of EXEC-01) evidenced; evaluation + improvement pass.

## Supersedes

Lease portion of obsolete `campaign-02-t02-execution-host.md`.
