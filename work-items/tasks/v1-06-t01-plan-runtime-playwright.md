# V1-06-T01: PlanRuntime on Playwright

Status: planned  
Story: V1-06  
Depends: V1-05-T02

## Spec

A `PlanRuntime` over `BrowserSession` resolves `label` / `text` / `role` to the current snapshot and runs each step through the harness. Snapshot refs may be used but are not required.

## Possible

Interpreter already exists in `src/plan/`. Implementation maps name → current `eN` then `session.act`. Re-inspect after every step (refs go stale).

## Do

- `PlaywrightPlanRuntime` (name in `src/plan/` or `src/session/`)
- Resolve by accessible name; fail closed if no unique match
- Each step uses required postconditions

## Tests

`tests/e2e/v1-06-plan-runtime.test.ts`

- Fixture labeled input: plan `{ click label, type "hello" }` → value is `hello`
- After a DOM change, a stale ref in the plan fails; the same step by label succeeds

## Done when

A page plan executes against real Playwright, not only `tests/unit/plan.test.ts`.
