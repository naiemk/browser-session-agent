# CAMPAIGN-01-T03: SQLite JobRepository

Status: done  
Spec: **STORE-01** … **STORE-05**, **STORE-07**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L1** (+ Node 24 / `node:sqlite` canary record)  
Expected paths: `src/durable/ports/repository.ts`, `src/durable/infrastructure/sqlite/**`

## Goal

One root versioned SQLite control DB with transactional commands, migrations, uniqueness,
and crash-injection tests on the **production** adapter.

## Discovery

- Run AGENT-12-T01 / `node:sqlite` canary; on failure **stop** for explicit decision
  (STORE-02) — do not silently swap libraries.
- Enumerate prototype multi-file write sequences as negative examples.

## Fix

- Schema/tables/indexes from jobs-v2-spec §3
- JobRepository port + sqlite implementation
- Commands: claimWork, heartbeat, commitOutcome, createHumanRequest, consumeGrant,
  activateRevision, cancelJob, upsertCases
- Forward-only migrations
- Contract suite against sqlite (STORE-07)

## Prohibited

- In-memory adapter as the only contract suite target
- Authoritative plan.json / sprints in V2
- Dual-write with prototype stores

## Tests

- Concurrent claim → one winner
- Crash between statements → invariant-valid DB
- Unique case/effect/fence constraints
- Migration idempotence

## Review focus

Transactions; fencing fields present; no domain→sqlite imports inverted.

## Depends on

CAMPAIGN-01-T01; AGENT-12-T01 canary result.

## Done when

STORE-01..05,07 evidenced at L1; evaluation + improvement pass complete.

## Supersedes

Obsolete `campaign-01-t02-transactional-repository.md` (storage half; importer is 01-T04).
