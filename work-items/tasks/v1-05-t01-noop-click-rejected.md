# V1-05-T01: No-op click is rejected

Status: done  
Story: V1-05  
Depends: V1-03-T02

## Spec

A click that hits a dead control or produces no snapshot/URL/dialog delta is `failed` / `noop`. The model-facing tool result is not `ok`. Postconditions are required; the model cannot skip them.

## Possible

Add `/dead-click` (or a no-op button on `/dynamic`) to the fixture app. `BrowserSession.act` already has optional `expect`; V1 makes a default click postcondition required (delta or explicit expect).

## Do

- Default click postcondition: non-empty snapshot diff or URL/title/dialog change
- Missing ref / Playwright throw / no delta → `verification: failed`
- Tool result `ok: false` with recovery

## Tests

`tests/e2e/v1-05-noop-click.test.ts`

- Fixture dead button: click → `verification.status` is `failed` (or `noop`)
- Result is not `{ ok: true }`
- Recovery note is present

## Done when

A no-op click cannot be narrated as a successful submit.
