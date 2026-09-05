---
id: AGENT-10-T04
title: Probe does not ingest a data document
story: AGENT-10
epic: agent
status: done
---

# AGENT-10-T04 — Probe does not ingest a data document

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D21 (probe is grep), D22 (exfiltration into context), D29 (turn cost)

## Possible

- `src/core/probe.ts` — `text` / `links` / `elements` return the body
- Same document classifier as T03

## Do

1. If the current tab is a non-HTML document (same classifier as T03), `text`, `links`, and `elements` return a short note plus content type and byte length, not the body.
2. Unknown fields stay rejected.
3. `page_meta` may still report url/title/content type.

## Tests

- `tests/e2e/agent-02-probe.test.ts` — open the JSON fixture, probe `text` is tiny and does not contain the payload's entity keys (e.g. no `users` blob).

## Done when

Probing a JSON tab cannot dump the payload into context.
