# MVP-03-T02: Bounded actions and verification

Status: done  
Story: MVP-03  
Depends: MVP-03-T01

## Spec

Navigate, click, type, select, scroll, and wait. Each action may include `expect` and always returns a verification result plus a fresh observation.

## Possible

Playwright locators on `[data-bsa-ref]` after a re-tag. `fill` plus `input`/`change` events for controlled fields. Wait is capped (max 15s) and must be a named condition (`load`, `url`, `text`, `ref`, `timeout`).

## Do

- Re-tag immediately before ref actions; missing ref → failed verification, no throw into the void
- `type` uses fill; password fields allowed only on `type=password` refs
- `expect`: `urlIncludes`, `titleIncludes`, `textVisible`, `refExists`, `dialogOpen`, `noConsoleError`
- Verification `passed` | `failed` | `inconclusive`

## Tests

- Login fixture: type email/password, click submit, expect URL includes `/jobs` → passed
- Click a missing ref → failed, recovery-ready error
- Wait for text that never appears (short timeout) → failed
- Select an option on `/apply` changes the posted value

## Done when

Every action response has `{ observation, verification }` and fixture flows can complete without CSS selectors.
