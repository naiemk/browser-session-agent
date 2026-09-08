# Evaluation: AGENT-14 (T01 + T02 core)

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: EFFECT / approval precision; SPEC-06 neverPreapprove; challenge-and-approval-handling
Evidence: L0/L1 unit + gate refuse canaries

## Discovery

- `forbiddenByEnvelope` only enforced destructive + payment name heuristics; credential/otp/captcha were list-only.
- `submits-form` was sufficient for outbound authorization.
- Typed durable `decideEffectAuthorization` already denied never categories.

## Changes

- Core gate: early refuse for all `neverPreapprove` categories (incl. password/otp/captcha)
- Reversibility: `BSA_GATE_EFFECT_AWARE=1` skips submits-form authorization rule
- `effect-identity.ts` for stage/destination-bound grant matching
- Tests: agent-14-approval, agent-14-gate-never

## Spec validation

| Requirement | Status |
| --- | --- |
| neverPreapprove reaches real gate | Pass (guardedAct refuse) |
| Credential/OTP/CAPTCHA not grantable | Pass |
| submits-form alone ≠ outbound (flag on) | Pass |
| Weak Apply/Submit sticky grant | Pass (ask) |
| Identity stage/destination drift | Pass |
| Legacy classifier unchanged (flag off) | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 2 | 4 | Early refuse before exploration path |
| Boundaries | 3 | 4 | |
| Safety | 3 | 4 | Nondelegables fail closed |
| Observability | 3 | 3 | Ledger approval refuse events |
| Test realism | 3 | 3 | Fake browser + durable envelope |
| Maintainability | 3 | 4 | Flag for submits-form cutover |

## Improvement pass

Moved neverPreapprove check before unauthorized exploration so password fills cannot bypass.

## Residual

- Full ask precision/recall matrix on Berlin asks still open.
- Sticky approval invalidation on amount/audience live canaries deferred.
- Default `BSA_GATE_EFFECT_AWARE` remains off until live comparison (enable in job runners when ready).
