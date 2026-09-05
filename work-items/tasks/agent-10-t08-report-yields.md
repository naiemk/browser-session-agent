---
id: AGENT-10-T08
title: Report yields; side tabs do not leak
story: AGENT-10
epic: agent
status: todo
---

# AGENT-10-T08 — Report yields; side tabs do not leak

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D55 (hosts spawn a harness). A report is the end of this prompt, not the end of the session.

## Possible

- `src/runtime/tools.ts` — `report` already sets `terminate: true` and calls `onReport`
- `src/hosts/web/runtime.ts` — `composeBrowserAgent` does not pass `onReport`; `toPiTool` may drop `terminate`

## Do

1. Hosted chat passes `onReport` that aborts the current prompt (`pi.abort()`), yields to the operator, and does not dispose the session.
2. `report` (and that abort) closes an open side tab.
3. Preserve `terminate` through the Pi tool wrapper if the engine honors it; abort is the guarantee.

## Tests

- `tests/unit/runtime-report-yield.test.ts` — after `report`, `onReport` fired, `terminate` is set, and an open side tab was closed.
- `tests/unit/hosted-report-yield.test.ts` — hosted `onReport` calls `abort` and does not `dispose`.

## Done when

A report stops the current prompt and does not leave a side tab open. The session remains usable for the next message.
