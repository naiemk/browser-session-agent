# CAMPAIGN-03-T02: Effect journal and approvals

Status: done  
Spec: **EFFECT-01** … **EFFECT-06**, **SPEC-06**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L2**, **L4** for uncertain crash windows  
Cross-epic: AGENT-14

## Goal

Honest effect journal + intent-bound EffectEnvelope + enforced nondelegable categories.

## Fix

- prepared/dispatched/observed/uncertain/reconciled/abandoned (EFFECT-01)
- Grant consume + dispatch one transaction (EFFECT-02)
- Envelope matching; ban submits-form / apply-alone outbound (EFFECT-03 / PERF-11)
- blocked.approval async for scheduled workers (EFFECT-04)
- Remembered approval identity fields (EFFECT-05)
- Typed neverPreapprove enforcement canaries (EFFECT-06 / SPEC-06)

## Tests

- Crash after dispatch → uncertain → reconcile
- Filter/search no ask; payment/send ask or deny
- Credential/OTP/CAPTCHA/destructive cannot be grant-preapproved

## Depends on

CAMPAIGN-03-T01; AGENT-14 contracts.

## Done when

EFFECT-01..06 evidenced; evaluation + improvement pass.

## Supersedes

Effects/approvals portion of obsolete `campaign-03-t02-effects-human-challenges.md`.
