---
id: AGENT-00-T01
title: New core seam, node vocabulary, and perception
story: AGENT-00
epic: agent
status: todo
---

# AGENT-00-T01 — New core seam, node vocabulary, and perception

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D34 (what is kept, what is rebuilt), D5 (semantic refs remain the only action locator), D16 (steer from snapshots, not frames)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — the four environment properties

## Possible

Kept and depended on, not modified:

- `src/worker/browser-worker.ts` — persistent context, CDP connect and reconnect, screencast
- `src/hosts/node-agent/client.ts`, `src/hosts/web/hub.ts` — outbound socket, frame relay, takeover input
- `src/hosts/shared/protocol.ts` — envelope and framing only

To be written fresh under a new core directory. Old equivalents (`src/session.ts`, `src/domain/`, `src/worker/observe.ts`) are references for **behaviour to port**, never code to import.

## Do

1. Create the new core as its own directory with an explicit dependency rule: it may import the kept transport and driver, and nothing from the rebuilt list in D34. Enforce it with a test, not a convention.
2. Define the new node RPC vocabulary over the kept socket: observe, probe, act, screencast, takeover input. Do not carry `startRun` / `act` / `inspect` semantics across.
3. Implement perception: a compact semantic snapshot with stable refs, roles, accessible names, values, disabled and checked state, dialogs, and page errors. Refs remain the only way to address a control.
4. Implement a single action choke point with a postcondition per action, so verification cannot be skipped by construction rather than by discipline.
5. Port the behavioural knowledge from the old system as new tests against the kept fixtures: noop click is a failure, type and select read back, Monaco editor values are readable, password values are redacted in the snapshot, combobox scroll variants behave.

## Tests

- `tests/unit/core-boundary.test.ts` — the new core imports nothing from the rebuilt paths in D34; a deliberate violation fails the test.
- `tests/e2e/core-perception.test.ts` — snapshot of the `/apply` fixture matches the DOM, refs are stable across two observations with no page change, password values are redacted.
- `tests/e2e/core-action-harness.test.ts` — the ported expectations: noop click rejected, type and select read-back, Monaco value read, combobox variants.

## Done when

A new core drives the kept Playwright transport with its own vocabulary, produces a semantic snapshot, and cannot execute an action without a postcondition. The boundary test proves no dependency on rebuilt code, and every ported behavioural expectation passes. All three test files are in the `npm test` glob.
