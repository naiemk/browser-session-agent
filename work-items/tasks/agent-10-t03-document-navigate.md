---
id: AGENT-10-T03
title: Navigate a document, not a payload
story: AGENT-10
epic: agent
status: done
---

# AGENT-10-T03 — Navigate a document, not a payload

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D17 (a successful navigate is a page the agent can work on)

## Possible

- `src/core/act.ts` — navigate primitive then URL postcondition, which treats JSON URLs as success
- `src/core/browser.ts` — `facts()` is the serializable place to carry document kind (no new RPC method)
- `tests/helpers/fixture-server.ts`

## Do

1. After navigate, classify the landed document: content-type json / xml / octet-stream, or a body that is a JSON object/array with no HTML root. Not a denylist of `/api/` paths.
2. If it is not HTML, the action fails, the previous URL is restored, and recovery says this is not a page (include content type and byte length).
3. An HTML page whose path happens to contain `/api/` still succeeds.

## Tests

- `tests/e2e/core-action-harness.test.ts` — fixture `/api/search` returns JSON; navigate there is not `ok`; the tab is still on the start page.
- Same file — an HTML page at a path containing `/api/` still navigates successfully.

## Done when

A JSON response is not a successful navigation, the previous page is restored, and HTML under `/api/` is still a page.
