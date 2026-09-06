---
id: AGENT-10-T07
title: Identity facts on the snapshot
story: AGENT-10
epic: agent
status: done
---

# AGENT-10-T07 — Identity facts on the snapshot

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D29 (prefer mechanisms that reduce turns). Not a new extract-the-page tool.

## Possible

- `src/core/types.ts` — `Observation`
- `src/core/perceive.ts` — collector
- `src/runtime/wire.ts` — what the model sees

## Do

1. Observation grows optional `identity: { heading?: string; stats?: { label: string; value: string }[] }`.
2. Fill from a visible `h1` and up to six nearby labeled numbers (`dt`/`dd`, or a short text node next to a number such as `12,345 followers`).
3. Wire it when present. Caps stay small.
4. Not a second probe; not a full page extract.

## Tests

- `tests/e2e/core-perception.test.ts` — fixture profile with heading + “12,345 followers” puts heading and that stat on the snapshot and on the wire.
- `tests/unit/runtime-wire.test.ts` — identity is omitted when empty; present when set.

## Done when

A profile-shaped fixture carries heading and stats on observe without a probe. `npm run suite:reference` still passes.
