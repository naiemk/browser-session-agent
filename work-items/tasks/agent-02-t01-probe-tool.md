---
id: AGENT-02-T01
title: Read-only probe tool
story: AGENT-02
epic: agent
status: todo
---

# AGENT-02-T01 — Read-only probe tool

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D21 (reads open, mutation scripting excluded), D5 (semantic refs), D18 (closed plan DSL)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — the browser's `grep`

## Possible

- `src/tools/register.ts` — tool registration and the `wrap` recorder
- `src/worker/browser-worker.ts` — internal `page.evaluate` already used for observation
- `src/hosts/shared/rpc-dispatch.ts` — node RPC surface
- `src/domain/types.ts` — `BROWSER_TOOL_NAMES`

## Do

1. Add `browser_probe`: takes a bounded read-only query over the current page, returns JSON only.
2. Execute on the desktop node. Reject anything that navigates, clicks, types, submits, or writes: no `goto`, `click`, `fill`, `press`, `evaluate` with assignment, no `window.location` writes, no form submission.
3. Cap wall time and output size; truncate in Pi's style with a continuation note.
4. Probe results must not be usable as an action channel: returned identifiers cannot be passed to act tools as selectors (D5 keeps refs as the only action locator).
5. Record every probe in the evidence ledger like any other tool call.
6. Register a prompt snippet and guidelines so the model reaches for probe before guessing.

## Tests

- `tests/e2e/agent-02-probe.test.ts` — probe returns a field inventory from the `/apply` fixture that matches the DOM; a probe attempting navigation, click, or fill is rejected with a clear error; oversized output is truncated with a notice; page state is unchanged after probing (URL, field values, and observation delta all identical).
- Probe rejection cases are table-driven so new mutation verbs are easy to add.

## Done when

`browser_probe` answers arbitrary read-only questions about the live page, provably leaves page state unchanged, cannot express a mutation, and appears in the evidence ledger. `tests/e2e/agent-02-probe.test.ts` is in the `npm test` glob and passes.
