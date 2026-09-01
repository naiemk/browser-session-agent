# V1-06-T02: Country combobox fixture

Status: done  
Story: V1-06  
Depends: V1-06-T01

## Spec

One fixture page covers the four country paths: first-hit United States, USA fallback, scroll to a known label, all-miss escalate with actuals and no selected value.

## Possible

`tests/fixtures/site/combobox.html` (or query flags: `?mode=usa-only` etc.). Reuse `selectCountryUnitedStates` from `src/plan/examples.ts` or a close variant. List must include a label that is only reachable by scroll when filter is empty.

## Do

- `/combobox` fixture with searchable list + scrollable panel
- Modes: full-name match, USA-only filter, no-filter scroll, empty list
- Run the example plan against each mode

## Tests

`tests/e2e/v1-06-combobox.test.ts`

- `united-states-first` → value is exactly `United States` (not “United States of America” unless that was the exact click)
- `usa-only` → first attempt actuals include miss; value `USA`
- `scroll-only` → scroll_until then click_first; value is a known label
- `none` → status `escalated`, actuals mention failed attempts, value empty

## Done when

The motivating country script is a Playwright E2E, not only a mock.
