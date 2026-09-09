---
id: AGENT-16-T03
title: Interactive /coach and plan-mode policy
story: AGENT-16
epic: agent
status: todo
---

# AGENT-16-T03 — Interactive `/coach` and plan-mode policy

Spec: **COACH-09**, **COACH-12**, **COACH-13**, **COACH-15**, **COACH-16**, **COACH-17**,
**COACH-18** (review-phase attribution), **COACH-19**
Authority: [`docs/coach.md`](../../docs/coach.md)
Pattern: `src/host/pi-plan-mode.ts`, `tests/unit/pi-subagent.test.ts` (plan-mode cases)

## Goal

The operator can `/coach` mid-run. Plan mode tells the planner to schedule scout →
coach → harvest when the loop is unknown. The executor cannot spawn a coach.

## Fix

1. Update `PLAN_MODE_CONTEXT` in `src/host/pi-plan-mode.ts` with COACH-09 (calibration
   vs known_flow vs ask; no invented tactic lists). Keep it short — this text is billed.
2. `src/host/pi-coach.ts`:
   - register `/coach`
   - disable the same mutation set plan-mode disables (`PLAN_MODE_DISABLED_TOOLS` plus
     anything that effects)
   - compile digest since last checkpoint (T01)
   - send digest as the coach user/follow-up payload, not the session transcript
   - validate model output with T02 `assertStrategyArtifact`
   - persist checkpoint (`appendEntry` custom type, same restore pattern as
     `pi-session-goal` / plan-mode)
   - inject **rendered artifact only** into the executing session; do not inject the
     digest
3. After success, treat the coach as a D52 compaction boundary (existing compaction
   hook may run; do not rewrite D52). Harvest/operate tools restored.
4. Model class: do not add a router (D12). Notify the operator that coach is
   review-phase and they may Ctrl+P to a stronger class. If the host already has a
   thinking/model selector, use it; do not hard-code a vendor model id.
5. Executor `subagent` MUST NOT accept `agent=coach`. Coach is this command / job
   review item.
6. Bind from `src/extension.ts` and `src/hosts/web/runtime.ts` next to `bindPlanMode`.
7. `/coach` during harvest: record that a new artifact replaces the previous one;
   do not interleave two loops on the same entity (document in the injected text).

## Tests

`tests/unit/pi-coach.test.ts`

- `/coach` disables `act` / `save` / `subagent` while the review turn runs.
- Fake assistant JSON becomes a persisted artifact; next session_start restores it.
- Digest passed to the model contains no `controls:` snapshot dump (from T01 fixture).
- Plan-mode context mentions scout, coach, harvest, and forbids inventing tactic lists
  (string match, like existing `/plan` tests).
- `subagent({ agent: "coach" })` is rejected or ignored.

No provider calls (D37).

## Depends on

AGENT-16-T01, AGENT-16-T02.

## Done when

FakePi covers the command; plan-mode copy matches COACH-09; checkpoints restore; act is
off during coach.
