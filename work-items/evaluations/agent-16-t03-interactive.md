# Evaluation: AGENT-16-T03 interactive `/coach`

Date: 2026-09-09
Implementer: Auto (Grok)
Spec IDs: COACH-09, COACH-12, COACH-13, COACH-15, COACH-16, COACH-17, COACH-18, COACH-19
Evidence: L0/L1 FakePi `tests/unit/pi-coach.test.ts`

## Changes

- `PLAN_MODE_CONTEXT` classifies calibration_required vs known_flow vs ask; forbids tactic lists
- `src/host/pi-coach.ts` `/coach`: digest in, mutations off, artifact checkpoint, harvest sees render only
- Magpie + hosted web bind; hosted command bar `/coach`
- `subagent({ agent: "coach" })` refused
- Coach `context` hook replaces the transcript with the digest

## Spec validation

| Requirement | Status |
| --- | --- |
| Plan-mode scout → coach → harvest copy | Pass |
| `/coach` disables act/save/subagent | Pass |
| Digest, not transcript, to the model | Pass |
| Fake JSON persists; session_start restores render | Pass |
| Executor cannot spawn coach | Pass |
| No provider calls | Pass |

## Residual

- R1.E2 live party.txt `/plan` then Execute (T05 host `/coach`) vs `goal_mtrvevpq001`
- Default model class unchanged (D12); operator Ctrl+P
- AGENT-16-T05 Magpie Execute auto-invokes `/coach` (FakePi 2026-09-10)
- AGENT-16-T04 job policy is R3
