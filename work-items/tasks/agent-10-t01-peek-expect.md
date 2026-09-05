---
id: AGENT-10-T01
title: Peek expect is data, matched is the URL
story: AGENT-10
epic: agent
status: done
---

# AGENT-10-T01 — Peek expect is data, matched is the URL

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D17 (harness accepts), D20 (predicates are data)

## Possible

- `src/runtime/tools.ts` — peek tool casts `raw.expect as Predicate`
- `src/core/peek.ts` — `matched` via `urlMatchesIntent`; identity is optional expect
- `src/core/predicates.ts` — `validatePredicate` already requires string `text` for `url_includes`

## Do

1. Parse peek `expect` with `validatePredicate` / `parsePredicate`. Malformed expect is dropped: no identity field, never evaluated.
2. Keep `matched` as URL landing, independent of identity. Wrong URL vs failed identity stay distinct notes.
3. Do not evaluate a predicate whose `text` is missing. `String.prototype.includes` on `undefined` is how `"undefined"` appeared on the wire.

## Tests

- `tests/unit/core-predicates.test.ts` — `{ kind: "url_includes" }` fails validation; a helper that drops invalid expect returns `undefined`.
- `tests/unit/runtime-peek-expect.test.ts` — the peek tool given `{ kind: "url_includes" }` does not mention `"undefined"` in the result.
- Existing `tests/e2e/core-peek.test.ts` still distinguishes matched-true / identity-failed from matched-false.

## Done when

Malformed peek expect is ignored rather than evaluated, and a missing `text` cannot produce `url includes "undefined"`. Tests above are in the `npm test` glob.

## Notes

A live run built `url_includes` without `text`. Instagram is an example, not a special case.
