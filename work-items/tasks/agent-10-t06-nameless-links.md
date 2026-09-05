---
id: AGENT-10-T06
title: Nameless links get a path name
story: AGENT-10
epic: agent
status: todo
---

# AGENT-10-T06 — Nameless links get a path name

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D5 (still a ref, not a CSS selector)

## Possible

- `src/core/perceive.ts` — `borrowedName` already takes an href tail when text is empty; generic names (`a`, whitespace) still fall through to the tag

## Do

1. Treat empty, whitespace, and generic names (`a`, `link`) as missing.
2. Fill from the last path segment of `href` (decode, strip extension, skip empty segments).
3. Keep D5: the control is still addressed by ref.

## Tests

- `tests/e2e/core-perception.test.ts` — `<a href="/p/abc"><img alt=""></a>` appears as a control whose name is `abc` (or the decoded segment).

## Done when

A grid of imageless links is addressable from the snapshot without probing every `a[href]`.
