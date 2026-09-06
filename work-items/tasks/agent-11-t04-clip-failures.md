---
id: AGENT-11-T04
title: Clip failure network lines once
story: AGENT-11
epic: agent
status: done
---

# AGENT-11-T04 — Clip failure network lines once

## Spec

- D29. Live run t24: 5,293 B failed click; the same CDN GETs appeared clipped on the observation and raw at the top level.

## Possible

- `src/runtime/wire.ts` — `toWireObservation` clips `failedRequests`; `toWireActionResult` copies `result.failure.failedRequests` unclipped

## Do

1. Clip top-level failure `consoleErrors` / `failedRequests` the same way as the observation (length and last-N).
2. Omit them on the action result when they are already on `observation`. Keep `recovery` and `why`.

## Tests

- `tests/unit/runtime-wire.test.ts` — a long failed-request URL is clipped; it is not duplicated at the top level when the observation already has it.

## Done when

A failed action does not bill the model twice for the same unclipped CDN URL.
