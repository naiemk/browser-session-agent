---
id: AGENT-04-T01
title: Failure evidence bundle
story: AGENT-04
epic: agent
status: todo
---

# AGENT-04-T01 — Failure evidence bundle

## Spec

- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — stop making root cause a guess
- [docs/decisions.md](../../docs/decisions.md) — D17 (harness accepts actions), D22 (redaction applies here too)

## Possible

- `src/worker/browser-worker.ts` — **kept** (D34): `consoleErrors` capture and screenshot are extended here
- `src/domain/verification.ts` (`recoveryNote`) and `src/domain/observe-diff.ts` (`diffControls`) — old implementations, shape references only; the delta and note are written fresh in the new core
- AGENT-00-T02 — the new ledger this writes to

## Do

1. On a failed action, return one bundle: the recovery note, the control delta, console errors, failed network requests, and the on-fail screenshot path.
2. Add failed-request capture to the worker (`requestfailed` and non-2xx for document and XHR), bounded to the last N per tab like console errors.
3. Keep the bundle compact and capped so it does not dominate context; detail stays in the ledger.
4. Apply D22 redaction before the bundle enters context.
5. Write the same bundle to the evidence ledger as a single event so failures are reviewable after the fact.

## Tests

- `tests/e2e/agent-04-failure-evidence.test.ts` — a fixture whose submit fails validation and logs a console error plus a failed request produces a bundle containing all five parts; the bundle is capped; the screenshot file exists at the referenced path.
- The bundle for a successful action is absent (no cost on the happy path).

## Done when

Every failed action returns recovery note, control delta, console errors, failed requests, and a screenshot reference in one capped, redacted bundle, and the same bundle is a single ledger event. The test above is in the `npm test` glob.
