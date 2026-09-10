---
id: AGENT-16-T01
title: Trajectory digest and yield events
story: AGENT-16
epic: agent
status: done
---

# AGENT-16-T01 — Trajectory digest and yield events

Spec: **COACH-01**, **COACH-02**, **COACH-03**, **COACH-04**, **COACH-18** (digest
truncation + size metering only)
Authority: [`docs/coach.md`](../../docs/coach.md)

## Goal

A host-neutral compiler turns ledger + metrics + yield events into a bounded digest the
coach can read. Clicks that returned `ok` are not treated as progress unless a yield
event says so.

## Discovery

1. Read `src/core/ledger.ts`, `src/runtime/metrics.ts`, `src/runtime/summary.ts`,
   `src/optimize/rollup.ts` (duplicate-work ideas only — do not import optimize from
   production).
2. Note that AGENT-15 no-progress is failed/stagnant actions; this ticket is wasted
   *successful* wandering.

## Fix

1. Add yield event kinds on the ledger (or a typed payload on existing `note` events —
   prefer an explicit type if the ledger union is the authority):
   `candidate_accepted`, `candidate_rejected`, `candidate_duplicate`,
   `fact_established`, `route_affordance`, `lost_place`.
2. Add `src/runtime/coach/digest.ts` that compiles `CoachDigest` from those inputs since
   a checkpoint timestamp / event id.
3. Include the COACH-02 fields. Cap at `COACH_DIGEST_MAX_BYTES` (32_768). Truncate
   oldest action lines first; never drop criteria or yield counts.
4. Detect navigation cycles (same page identity → entity → back) and repeated
   observation hashes from existing metric hashes.
5. Optional snapshot quote: ≤ 500 chars, only attached to a named failure.
6. Do not read Pi transcripts or Playwright.

## Tests

`tests/unit/coach-digest.test.ts`

- Wandering fixture: list → profile navigate → back → lost place, zero accepts, rising
  cost. Digest flags the cycle and `lost_place`. Byte length under cap. No raw snapshot
  dump.
- Guided fixture: venue → tagged → peek → accept. Digest shows yield per successful
  peek and accepted count > 0.
- Truncation: 200 action lines still keeps criteria + yield totals.
- Pure: module import graph has no Pi / Playwright / `node:fs`.

## Depends on

None.

## Done when

Cited COACH IDs have tests; a digest can be built in memory from `memoryEvidence()`-style
inputs; production code does not import `src/optimize`.
