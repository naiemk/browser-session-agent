---
id: AGENT-10-T09
title: Shorten tool schemas
story: AGENT-10
epic: agent
status: todo
---

# AGENT-10-T09 — Shorten tool schemas

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D6 (one agent), D29 (resent every turn)

## Possible

- `src/runtime/tools.ts` — 14 tools; peek `expect` is `additionalProperties: true`
- `src/runtime/agent.ts` — `fixedOverhead().toolSchemaBytes`
- `optimize/baseline.json` — currently 6372

## Do

1. Same 14 tools. No tool removed.
2. Shorten each description to one job sentence.
3. Give peek `expect` a real predicate schema (kind plus the fields a predicate uses), not an open object.
4. Assert `fixedOverhead().toolSchemaBytes` is below 6372. `optimize:check` still runs (it reports, it does not fail the build).

## Tests

- `tests/unit/runtime-overhead.test.ts` — tool count is 14; `toolSchemaBytes < 6372`.

## Done when

Overhead dropped, tool count unchanged, suite reference still green.
