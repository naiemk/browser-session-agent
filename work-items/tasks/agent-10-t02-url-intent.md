---
id: AGENT-10-T02
title: Canonical URL intent
story: AGENT-10
epic: agent
status: done
---

# AGENT-10-T02 — Canonical URL intent

## Spec

- Shared helper already used by act (navigate postcondition) and peek (`matched`).

## Possible

- `src/core/url-intent.ts` — host match + `pathname.startsWith`
- `src/core/act.ts`, `src/core/peek.ts` — callers
- `src/domain/verification.ts` — a second copy; switch it to the shared helper

## Do

1. Normalize trailing slash and percent-decode path segments before comparing.
2. Last path segments match if they are equal, or one is the other plus `s` (so `/reel/X` and `/reels/X` match; `/p/X` and `/reels/X` do not).
3. Keep host matching. Prefix match remains for nested paths (`/jobs` still matches `/jobs/42`).
4. One function, used by navigate, peek, and the old domain verifier.

## Tests

- `tests/unit/core-url-intent.test.ts` — table-driven: slash, encoding, last-segment plural, different stems, host mismatch.

## Done when

`urlMatchesIntent` is the single comparison, the table passes, and no live site is required.

## Notes

`/reel` vs `/reels` showed up on a social site. The rule is about English plural stems in a path segment, not that site.
