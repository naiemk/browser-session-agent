# AGENT-00: A new core on the kept transport

Status: todo

As the team, we build the agent core from scratch on top of the existing Playwright connection and product shell, so the new design is not shaped by assumptions we have already rejected.

## Acceptance criteria

- The new core lives in its own directory and imports nothing from D34's rebuilt list. A test proves it, and a deliberate violation fails.
- It speaks its own node RPC vocabulary (observe, probe, act, screencast, takeover input) over the kept socket, auth, framing, and frame relay. Old verb semantics are not carried across.
- Perception produces a compact semantic snapshot with stable refs; refs remain the only way to address a control (D5).
- Actions pass through one choke point with a postcondition, so verification cannot be skipped by construction.
- Behavioural knowledge from the old system is ported as new tests against the kept fixtures: noop click rejected, type and select read-back, Monaco values readable, password redaction, combobox scroll variants.
- State is entity-oriented with idempotency keys from the outset, and an append-only ledger carries intent, before, action, after, outcome.
- Disk state alone is sufficient to reconstruct a goal, with no session context.
- No knowledge store is built here; memory stays gated behind AGENT-07-T02.

## Decisions

D34 (clean-slate boundary), D35 (cutover by suite), D31 (entity state, cold resume), D5, D7, D16, D22.

## Tasks

- [AGENT-00-T01](../tasks/agent-00-t01-core-seam-and-perception.md)
- [AGENT-00-T02](../tasks/agent-00-t02-evidence-and-state-store.md)

## Tests

`tests/unit/core-boundary.test.ts`, `tests/e2e/core-perception.test.ts`, `tests/e2e/core-action-harness.test.ts`, `tests/unit/core-ledger.test.ts`, `tests/unit/core-entity-state.test.ts`.
