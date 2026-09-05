---
id: AGENT-10-T05
title: Collapse stuttered accessible names
story: AGENT-10
epic: agent
status: done
---

# AGENT-10-T05 — Collapse stuttered accessible names

## Spec

- Names on the snapshot are what the model addresses (D5). Doubled names are noise, not identity.

## Possible

- `src/core/perceive.ts` — collector builds `name` from aria/label/text

## Do

1. After collecting a name, collapse stutter: a string that is two identical halves becomes one half (`SearchSearch` → `Search`).
2. Tokenize on case/digit boundaries and drop consecutive duplicate tokens (`Messages1Messages` → `Messages 1`).
3. Do it in TypeScript on the collected controls (testable without duplicating the in-page script). No site-specific labels.

## Tests

- `tests/unit/core-accessible-name.test.ts` — table of collapse cases.
- `tests/e2e/core-perception.test.ts` — fixture HTML that concatenates a label twice appears once on the control.

## Done when

Stuttered names are collapsed in unit tests and on a fixture page. No special-case vocabulary.
