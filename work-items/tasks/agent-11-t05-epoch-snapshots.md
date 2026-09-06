---
id: AGENT-11-T05
title: Drop superseded snapshots inside the current epoch
story: AGENT-11
epic: agent
status: done
---

# AGENT-11-T05 — Drop superseded snapshots inside the current epoch

## Spec

- D29. `compactFinishedWork` currently prunes only before the last user message.
- Live run: one operator answer, placeholders stuck at 9,277 B, live 299 kB after ~20 full act snapshots.

## Possible

- `src/runtime/prune.ts` — `boundary === 0` leaves the whole transcript; the suffix after a later user message is never pruned
- `tests/unit/runtime-epoch.test.ts` — asserts the current piece of work is left completely alone

## Do

1. After the epoch split, `pruneMessages` the current epoch too, `keepLatest: 1`, `group: "any"` (same rule finished work uses). Newest snapshot stays for refs. Errors, checks, remember, assistant text stay.
2. Placeholders are in-place replacements. After the first drop, that placeholder prefix must not be rewritten every turn. `rewrittenFrom` must not be 0 every turn.
3. Do not prune from index 0 on every turn — that is the 2.5× cache-invalidation failure mode.

## Tests

- `tests/unit/runtime-epoch.test.ts` — one user message and three act snapshots: two placeholders, newest live. Append a fourth: `rewrittenFrom` is the superseded snapshot, not 0. GLM `content.filter` still works.
- Existing “finished work drops old pages, remember survives” still holds.

## Done when

A 50-turn silent stretch does not keep every act snapshot live. The prompt cache is not invalidated from the front every turn.
