---
id: AGENT-11-T03
title: Expect-reject note matches the error
story: AGENT-11
epic: agent
status: done
---

# AGENT-11-T03 — Expect-reject note matches the error

## Spec

- Live run t25: `unknown predicate kind "role"` plus “There is no download predicate…”

## Possible

- `src/runtime/tools.ts` — canned download note on every failed `validatePredicate`

## Do

1. Return the validation errors. Do not append a download note. Do not repeat the allowed-kinds list if `validatePredicate` already named them.

## Tests

- `tests/unit/runtime-act-expect.test.ts` — `kind: "role"` is rejected; the result does not mention download.

## Done when

A bad expect kind is explained as that kind, not as a missing download verb.
