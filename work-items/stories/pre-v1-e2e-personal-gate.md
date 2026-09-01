# PRE-E2E: Personal Production Gate

Status: done

As the product, Pre-V1 exit criteria are one CI-runnable path without a live LLM, plus config contracts and a stable combobox scroll path.

## Acceptance criteria

- Unpaid register → pair helper → start a goal → country page plan on a local fixture → takeover → resume → quit helper → `helper_disconnected`; chat still up.
- No `mark-paid` step. No hardcoded refs. No live job boards.
- Manifest tests: gateway routes, TLS cookie flag, node compose without required `BSA_TOKEN`, vibed host.
- Combobox `scroll-only` does not flake on click-detach in CI.
- `npm test` includes the onboarding file once implemented.
- Hitting the live hostname is **manual**.

## Decisions

Same role as V1-E2E for this cut. See `docs/pre-v1.md` exit criteria.

## Tasks

- [PRE-E2E-T01](../tasks/pre-v1-e2e-t01-onboarding.md)
- [PRE-E2E-T02](../tasks/pre-v1-e2e-t02-combobox-stable.md)

## Tests

`tests/e2e/pre-v1-e2e-onboarding.test.ts` and harden `tests/e2e/v1-06-combobox.test.ts`. See `docs/test-design.md` (PRE-E2E).
