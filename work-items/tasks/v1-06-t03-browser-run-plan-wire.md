# V1-06-T03: browser_run_plan on the wire

Status: planned  
Story: V1-06  
Depends: V1-06-T01, V1-03-T01

## Spec

Chat/tool `browser_run_plan { plan }` streams `ProgressEvent`s and returns `{ status, actuals, completedActionIds }`. Invalid or Playwright-JS-shaped plans are rejected by the validator.

## Possible

Register the tool next to existing browser tools. Stream progress as tool updates or WS events. Validator is `validatePagePlan`.

## Do

- `browser_run_plan` on the helper via RPC
- Progress events on the chat protocol
- Reject unknown ops / oversized plans before any act

## Tests

`tests/e2e/v1-06-run-plan-wire.test.ts`

- Valid small plan → progress includes `action_start` / `attempt_start` / `plan_done` (or `escalate`)
- Result body has `actuals`
- `{ op: "evaluate", script: "…" }` → `invalid_plan`, zero acts on the page

## Done when

The hosted agent can submit a plan once and observe it run without one LLM call per step.
