# Evaluation: AGENT-16-T01 trajectory digest

Date: 2026-09-09
Implementer: Auto (Grok)
Spec IDs: COACH-01, COACH-02, COACH-03, COACH-04, COACH-18 (size cap)
Evidence: L0 `tests/unit/coach-digest.test.ts`

## Discovery

- Ledger had no semantic yield type; only `note` / `action` / `probe`.
- Optimize rollup duplicate-work ideas exist; digest must not import `src/optimize`.

## Changes

- `yield` ledger event + `src/runtime/coach/yield.ts`
- `src/runtime/coach/digest.ts` compiles a capped JSON digest from ledger + metrics
- `remember` optional `yield=` so executors can record COACH-03 kinds
- Truncation drops oldest action lines first; criteria and yield counts stay

## Spec validation

| Requirement | Status |
| --- | --- |
| Digest from durable evidence, not transcripts/snapshots | Pass |
| COACH-02 fields present when known | Pass |
| Yield kinds on the ledger | Pass |
| Pure / host-neutral (no Pi, Playwright, `node:fs`, optimize) | Pass |
| Cap 32_768; truncate actions first | Pass |

## Residual

- Live switched-model / Instagram digest sample is R1.E2, not this ticket.
