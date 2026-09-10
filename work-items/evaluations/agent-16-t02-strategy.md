# Evaluation: AGENT-16-T02 strategy artifact

Date: 2026-09-09
Implementer: Auto (Grok)
Spec IDs: COACH-05, COACH-06, COACH-07, COACH-08, COACH-17 (no skip-approval)
Evidence: L0 `tests/unit/coach-strategy.test.ts`

## Changes

- `src/runtime/coach/strategy.ts` parse / assert / render (site-skill pattern)
- Unknown keys dropped; lists/strings capped
- `assertStrategyArtifact` rejects criteria/grant/send/follow and skip-approval language
- Card renders the artifact as untrusted guidance; `strategyArtifact` is not dumped as a fact

## Spec validation

| Requirement | Status |
| --- | --- |
| Closed schema, unknown keys dropped | Pass |
| Reject spec rewrite / DM without approval | Pass |
| Untrusted guidance line (D25) | Pass |
| Render ≤ 2_000 chars | Pass |
| Empty parse → undefined; assert throws | Pass |

## Residual

- Jobs ContextCompiler consume path is T04 / R3.
