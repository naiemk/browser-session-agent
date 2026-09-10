# Evaluation: AGENT-16-T05 Magpie Execute invokes `/coach`

Date: 2026-09-10
Implementer: Auto (Grok)
Spec IDs: COACH-09, COACH-12, COACH-13, COACH-15, COACH-16, COACH-17, COACH-19
Evidence: L0/L1 FakePi `tests/unit/pi-coach.test.ts` (AGENT-16-T05)

## Changes

- `coachStepNumber` / `executorRemaining` / `preCoachComplete` in `src/host/pi-plan-todos.ts`
- `bindCoach` exports `startReview`, `hasArtifact`, `onArtifact`
- Magpie Execute remaining-steps omit the coach-role todo until a checkpoint exists
- Plan `agent_end` calls `startReview` when every pre-coach todo is `[DONE:n]`
- After a valid artifact, host marks the coach todo complete and continues harvest
- `src/extension.ts` and `src/hosts/web/runtime.ts`: `bindCoach` then `bindPlanMode({ coach })`

## Spec validation

| Requirement | Status |
| --- | --- |
| Live todo strings: coach is first `/\bcoach(?:ing)?\b/i` (step 4), harvest-phase after | Pass |
| Execute omits `Coach: Submit` and Harvest | Pass |
| Pre-coach `[DONE:n]` + `agent_end` runs T03 handler (mutations off, digest) | Pass |
| Artifact → coach todo completed by host; Harvest injected; no second review | Pass |
| known_flow Execute does not start review | Pass |
| `subagent({ agent: "coach" })` still refused (T03) | Pass |
| No provider calls | Pass |

## Residual

- If GLM never emits `[DONE:n]` for pre-coach steps, auto-coach still will not fire.
  Execute copy now tells it to stop after scout and not spawn a planner as coach.
- R1.E2 live party.txt. `goal_mtumeewm001` does not close E2.
- AGENT-16-T04 job policy is R3
