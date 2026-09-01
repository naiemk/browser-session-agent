---
id: PRE-E2E-T02
title: Combobox scroll-only stable
story: PRE-E2E
epic: pre-v1
status: done
---

# PRE-E2E-T02 — Combobox scroll-only stable

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md)
- [docs/test-design.md](../../docs/test-design.md) — V1-06 flake (GitHub **push** CI vs **pull_request** CI)

## Possible

- `tests/e2e/v1-06-combobox.test.ts` — scroll-only click currently can hit a detached / not-visible option
- `src/runtime/page-plan.ts` — click / scroll-into-view

## Do

1. Harden the existing `v1-06` combobox path so scroll-only click is stable in CI (force-click and/or no detach: wait for attached+visible, re-query the option after scroll, or equivalent).
2. Do not weaken the assertion (the click must still select Canada). Do not skip the test.

## Tests

Harden existing `tests/e2e/v1-06-combobox.test.ts` (force-click / no detach). No new Pre-V1 test file unless a thin wrapper is needed.

## Done when

The scroll-only Canada click does not flake on GitHub **push** CI. V1-06 still proves the plan.
