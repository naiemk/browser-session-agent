# V1-06: Page Plans

Status: planned

As a user, the agent handles a combobox (United States → USA → scroll) in one plan; I see progress and actuals.

## Acceptance criteria

- `browser_run_plan` runs on Playwright through the harness, not only the in-memory mock.
- Targets resolve by accessible name (`label` / `text` / `role`); snapshot refs are allowed but not required inside a multi-step attempt.
- Country fixture covers first-hit, USA fallback, scroll-to-label, and all-miss escalate with actuals (no selected value).
- Progress events stream; the tool result is `{ status, actuals, completedActionIds }`.
- A JS-shaped or oversized plan is rejected by the validator.
- `browser_fill` is syntactic sugar: one call fills a form; each field is harness-checked.

## Decisions

See `docs/v1.md` page plans and `docs/decisions.md` D2, D18. Interpreter types already live in `src/plan/`.

## Tasks

- [V1-06-T01](../tasks/v1-06-t01-plan-runtime-playwright.md)
- [V1-06-T02](../tasks/v1-06-t02-country-combobox-fixture.md)
- [V1-06-T03](../tasks/v1-06-t03-browser-run-plan-wire.md)
- [V1-06-T04](../tasks/v1-06-t04-browser-fill-sugar.md)

## Tests

New `/combobox` fixture plus login/apply fill. See `docs/test-design.md` (V1-06).
