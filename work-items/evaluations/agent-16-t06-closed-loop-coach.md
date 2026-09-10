# Evaluation: AGENT-16-T06 Magpie closed-loop coach

Date: 2026-09-10
Implementer: Auto (Grok)
Spec IDs: COACH-03, COACH-06, COACH-07, COACH-11 (Magpie analogue), COACH-12, COACH-13,
COACH-15, COACH-16, COACH-19
Evidence: L0/L1 FakePi `tests/unit/pi-coach.test.ts`, `coach-strategy.test.ts`,
`coach-rescue.test.ts`, `runtime-epoch.test.ts` (AGENT-16-T06)

## Changes

- Execute still sends one scout-only `plan-mode-execute` (T05 race). Widget still lists Coach/Harvest.
- While `awaitingHostCoach()`, `subagent` and `scratch_write` are off; restored after the artifact.
- Scout `remember` `route_affordance` / `fact_established` + `agent_end` starts `/coach` without `[DONE:n]`. Empty puff does not.
- Review turn requests Pi thinking level `high` and restores the previous level (no vendor model id).
- Digest `goal` is the first operator message / plan slice, not the generic Magpie card. `previousStrategy.followed` is false when harvest recorded zero `candidate_*`.
- `SPEC_REWRITE` no longer rejects “no explicit follower threshold”; lowering the bar still rejects.
- Harvest remaining-steps require trial loop + `candidate_*` yield; falsify → stop for Magpie.
- Compaction: keepLatest 0 on snapshots before the last `[COACH REVIEW]` / STRATEGY message; artifact kept.
- Magpie rescue: 12 site actions without `candidate_*` (or 2 navigation cycles / `lost_place`) re-leases `/coach`. Wall-clock ignored. Second empty rescue halts.

## Spec validation

| Requirement | Status |
| --- | --- |
| One Execute follow-up, scout-only | Pass (T05 + T06) |
| `subagent` absent while awaiting host coach; restored after artifact | Pass |
| Scout yield without `[DONE:n]` starts review; empty puff does not | Pass |
| Stronger thinking class requested and restored | Pass |
| Digest goal is the plan objective, not “Help the operator” | Pass |
| “no explicit follower threshold” accepts; lower-the-bar rejects | Pass |
| Harvest injection has STRATEGY, not scout `controls:` dump | Pass |
| N actions / 0 `candidate_*` → second review; `followed: false` | Pass |
| `wallMs` alone does not rescue | Pass |
| Second empty rescue → halt, no third digest review | Pass |
| No provider calls | Pass |

## Residual

- **R1.E2 live** `docs/example-prompts/party.txt` `/plan` then Execute. FakePi does not close E2. `goal_mtvqt1a6001` / `goal_mtvpsym1001` / `goal_mtvx69qt001` do not close E2.
- **2026-09-10 `goal_mtvx69qt001`:** Execute called `maybeStartCoach` immediately; plan-mode `route_affordance` counted as scout yield → coach skipped scout; widget froze on Scout 1 while harvest ran (~$0.58). Patched: no coach on Execute click; scout epoch filters plan-mode yields; `markPreCoachComplete` so the widget advances to Coach → Harvest.
- Peek snapshots on Instagram profiles can still be thinner than main-tab `act` (PERF-04). Dialog scroll (PERF-05) still out of scope. Success is try-or-falsify → rescue, not 200 peeks from a broken followers modal.
- Jobs `CoachingPolicy` / materializer remains AGENT-16-T04 / R3.
