---
id: AGENT-16-T02
title: Strategy artifact schema
story: AGENT-16
epic: agent
status: todo
---

# AGENT-16-T02 — Strategy artifact schema

Spec: **COACH-05**, **COACH-06**, **COACH-07**, **COACH-08**, **COACH-17** (artifact
cannot skip approval)
Authority: [`docs/coach.md`](../../docs/coach.md)
Pattern: `src/runtime/site-skill.ts`

## Goal

Coach output is a capped, consume-only guideline. Invalid or spec-rewriting output
cannot become harvest prompt state.

## Fix

1. `src/runtime/coach/strategy.ts`: parse, drop unknown keys, cap lists/strings per
   COACH-05.
2. Reject (structured error, not coerce) text that rewrites criteria, grants, send,
   follow, or approval policy (COACH-06). Route-only language is allowed.
3. `renderStrategyArtifact` for the harvest card: short, labeled, includes the D25
   untrusted-guidance line (same spirit as site skill).
4. Helper to attach the rendered block onto `TaskCardInput` / known facts without
   duplicating site-skill plumbing. Do not inflate the card; D29 still applies.

## Tests

`tests/unit/coach-strategy.test.ts`

- Accept a venue → tagged posts → peek → qualify guideline matching the Instagram
  operator guide.
- Reject an artifact that changes follower thresholds or says to DM without approval.
- Unknown keys dropped; over-long lists truncated.
- Rendered card text stays small (assert a hard character cap, e.g. 2_000).
- Empty / non-object input is undefined, not a throw in the parse path (site-skill
  style); a separate `assertStrategyArtifact` throws for coach-turn validation.

## Depends on

AGENT-16-T01 not required (schema is independent). Land after or parallel; do not block
on digest.

## Done when

Cited IDs tested; harvest can consume a fixture artifact with no digest and no Pi.
