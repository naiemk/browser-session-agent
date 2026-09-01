---
id: PRE-05-T02
title: Harness + plan cards
story: PRE-05
epic: pre-v1
status: planned
---

# PRE-05-T02 — Harness + plan cards

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md) — harness + plan actuals on the real origin
- [docs/v1.md](../../docs/v1.md) — V1-05 / V1-06 wire events

## Possible

- `src/hosts/web/public/app.js` — chat shell
- `src/hosts/web/consumer-hub.ts` — verification and plan progress events

## Do

1. Chat WS / UI shows harness verification actuals (same honesty as V1-05).
2. Plan progress events already on the wire are rendered (progress + actuals), not only dumped as raw JSON.
3. Works on the consumer origin (cookie session), not `?token=`.

## Tests

`tests/e2e/pre-v1-05-harness-plan-cards.test.ts`

## Done when

Harness cards and plan progress/actuals are visible in the chat UI. Named test is in CI.
