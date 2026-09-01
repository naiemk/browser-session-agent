---
id: PRE-E2E-T01
title: Unpaid onboarding gate
story: PRE-E2E
epic: pre-v1
status: planned
---

# PRE-E2E-T01 — Unpaid onboarding gate

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md)
- [docs/test-design.md](../../docs/test-design.md) — Pre-V1 map, personal production gate

## Possible

- `tests/e2e/v1-e2e-onboarding.test.ts` — V1 path (paid); Pre-V1 must not require mark-paid
- `tests/helpers/v1.ts`

## Do

1. One CI-runnable path **without a live LLM**: unpaid (no mark-paid) register → pair (helper child or docker-compose contract) → start → country plan → takeover → resume → quit → `helper_disconnected`.
2. Keep `BSA_NO_PI` in this automated path if the stub is still the CI agent; the gate is protocol + unpaid, not a live model.
3. Live `https://agent.trustless-commerce.com` smoke stays **manual**.

## Tests

`tests/e2e/pre-v1-e2e-onboarding.test.ts`

## Done when

The unpaid onboarding path is in the `npm test` glob and does not call `mark-paid`.
