---
id: AGENT-16-T04
title: Job coaching policy and invocation
story: AGENT-16
epic: agent
status: todo
---

# AGENT-16-T04 — Job coaching policy and invocation

Spec: **COACH-08**, **COACH-10**, **COACH-11**, **COACH-13**, **COACH-14**, **COACH-15**,
**COACH-18**
Authority: [`docs/coach.md`](../../docs/coach.md)
Jobs V2: EXEC-04, QUALITY-04, OBS-01, OBS-04 — **extend, do not reopen cutover**

## Goal

An approved spec can require calibration. The scheduler leases scout, then a review-phase
coach, then harvest. Harvest CompiledAttempt contains the strategy artifact, not the
scout transcript.

## Fix

1. Optional `coaching?: CoachingPolicy` on `WorkflowSpecV2` (`spec-types.ts`). Omitted =
   `off`. Compiler accepts the shape in COACH-10; rejects `rescue` with only a time
   field if anyone adds one.
2. Materializer: `mode: "calibration"` seeds job-scoped scout, coach, harvest (or the
   equivalent templates with dependencies). Harvest MUST NOT be ready until a validated
   strategy artifact exists for this spec version.
3. Coach attempt: phase `review`, capabilities without `act` (`capabilitiesForPhase`).
   ContextCompiler input = digest (from T01) + spec slice + budgets. No transcripts
   (EXEC-04).
4. Harvest attempt: ContextCompiler includes rendered artifact / evidence ref. MUST NOT
   include scout observations.
5. Rescue (if policy present): enqueue coach and pause that harvest stream when yield
   counters trip. Same EXEC-07 spirit: a second rescue without new yield or a new
   artifact halts for the operator. Wall-clock MUST NOT be a trigger.
6. Do not amend historical CAMPAIGN ticket evaluations. Add COACH-* to the Jobs V2
   requirement index only as a **post-cutover** row pointing at this ticket, or keep
   the index in `docs/coach.md` as the authority (preferred if the cutover table is
   frozen).

## Tests

`tests/unit/durable-coaching.test.ts`

- Spec without `coaching` compiles; no extra coach work item.
- `mode: "calibration"` materializes scout → coach → harvest dependencies.
- Harvest is not ready before an artifact.
- Compiled harvest context fixture has artifact text and no snapshot array.
- Rescue: `actionsWithoutYield` trips; `{ type: "elapsed", ms }` (if sneaked) is
  rejected by compiler.
- Domain still passes DOM-02 (no Pi in `src/durable/domain`).

## Depends on

AGENT-16-T01, AGENT-16-T02. T03 not required for jobs, but the artifact/digest APIs
must exist.

## Done when

Cited IDs tested at L0 (compiler/materialize/context). L2 kernel wiring only if an
existing mock kernel path is cheap; do not build a new execution host. No Instagram
live run required to merge.
