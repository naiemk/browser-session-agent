---
id: PRE-02-T01
title: Unpaid start-run allowed
story: PRE-02
epic: pre-v1
status: done
---

# PRE-02-T01 — Unpaid start-run allowed

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md) — no Stripe, no payment_required
- [docs/v1.md](../../docs/v1.md) — V1-08 billing hook stays unused in Pre-V1

## Possible

- `src/hosts/web/server.ts` — consumer `requirePaid: true`
- `src/hosts/web/consumer-hub.ts` — `startRun` / `payment_required`
- `src/hosts/web/accounts.ts` — accounts remain unpaid unless marked

## Do

1. Consumer `start` for a registered unpaid account (never `mark-paid`) succeeds when a helper is connected.
2. `startRun` never returns `payment_required`.
3. Do not add Stripe. `BSA_TOKEN` remains an operator escape hatch (not required for this path).

## Tests

`tests/e2e/pre-v1-02-unpaid-start.test.ts`

## Done when

Unpaid register → pair → start works. No `payment_required` on the consumer hub.
