---
id: AGENT-00-T02
title: New evidence ledger and entity-oriented state
story: AGENT-00
epic: agent
status: todo
depends: AGENT-00-T01
---

# AGENT-00-T02 — New evidence ledger and entity-oriented state

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D34 (stores are rebuilt), D31 (entity-oriented state with idempotency keys), D7 (evidence on disk, not in the session), D22 (redaction applies to the ledger)
- [docs/v2-campaigns.md](../../docs/v2-campaigns.md) — why state is entity-shaped from the start

## Possible

`src/store/run-store.ts` and `src/store/knowledge-store.ts` are references for shape only. The old `RunState` is run-scoped and is the thing being corrected.

## Do

1. Append-only event ledger per goal: each event carries intent, before, action, after, and outcome, so a trace is readable without the transcript.
2. Entity-oriented records from the outset: stable entity id, stage, and an `idempotencyKey` on every consequential action. Do not model a goal as a single run blob.
3. State on disk must be sufficient to resume with no session context (D31). No in-memory-only fields that matter.
4. Apply D22 redaction on write, since traces outlive the session.
5. Bound growth: cap per-event payloads and keep large artifacts (screenshots) as file references.
6. No knowledge store yet. Memory is gated behind AGENT-07-T02.

## Tests

- `tests/unit/core-ledger.test.ts` — events round-trip; a redacted field is redacted on disk; payload caps hold; large artifacts are references, not inline.
- `tests/unit/core-entity-state.test.ts` — two entities advance independently within one goal; a duplicate `idempotencyKey` is refused; a fresh reader reconstructs full state from disk alone.

## Done when

The new core persists an append-only ledger and entity-oriented state with idempotency keys, redacted on write, reconstructable from disk with no session. Both test files are in the `npm test` glob.
