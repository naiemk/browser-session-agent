# V1-E2E-T01: Consumer onboarding gate

Status: planned  
Story: V1-E2E  
Depends: V1-01-T03, V1-02-T04, V1-04-T02, V1-06-T03, V1-08-T02

## Spec

One CI path proves the four `docs/v1.md` exit criteria: register, pair helper, start a goal, run the country plan on a local fixture, takeover, resume, quit helper, UI/API shows disconnected. No hardcoded refs. No live job boards.

## Possible

Compose the existing E2E helpers (account, pair, fixture, plan, takeover). `BSA_NO_PI=1` or a scripted plan submit so CI does not need a hosted LLM. `npm test` includes `tests/e2e/v1-e2e-onboarding.test.ts`.

## Do

- Single test file that walks the consumer loop
- Country plan on `/combobox` (or apply+combobox)
- Takeover + resume + kill helper
- Assert Connected → disconnected message

## Tests

`tests/e2e/v1-e2e-onboarding.test.ts`

- Register and session (no `?token=`)
- Pair helper → Connected
- Start goal; run plan; actuals show a selected country or an escalate with actuals (fixture mode documented)
- Takeover then resume from a new observation
- Quit helper → `helper_disconnected` (chat still up)

## Done when

`npm test` in CI fails if the consumer onboarding loop regresses.
