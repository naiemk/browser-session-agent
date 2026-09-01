# V1-E2E: Consumer Onboarding Gate

Status: done

As the product, the four V1 exit criteria are one CI-runnable path.

## Acceptance criteria

- Register → pair a helper process → start a goal → run the country page plan on a local fixture → takeover → resume → quit helper → API/UI shows disconnected.
- The test does not hardcode control refs and does not hit live job boards.
- `npm test` includes this case.

## Decisions

Same role as [MVP-E2E-T01](../tasks/mvp-e2e-t01-prompt-jsonlint.md) for the consumer stack. See `docs/v1.md` exit criteria.

## Tasks

- [V1-E2E-T01](../tasks/v1-e2e-t01-consumer-onboarding.md)

## Tests

`tests/e2e/v1-e2e-onboarding.test.ts`. See `docs/test-design.md` (V1-E2E).
