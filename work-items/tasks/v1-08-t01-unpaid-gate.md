# V1-08-T01: Unpaid gate

Status: planned  
Story: V1-08  
Depends: V1-01-T02, V1-02-T01

## Spec

New accounts default to unpaid. Chat still works. `browser-start` (or equivalent) fails with `payment_required`.

## Possible

`account.plan` or `account.paidAt` on the session store. Gate only browser-run start and helper-consuming tools, not chat completions.

## Do

- Default unpaid on register
- Start-run checks paid flag
- Chat prompt path does not require paid

## Tests

`tests/e2e/v1-08-unpaid.test.ts`

- Register → chat prompt → `agentEvent` (no helper required)
- Pair may succeed (connector) but start-run → `payment_required`
- Error code is stable for the UI

## Done when

Unpaid users cannot burn helper/browser minutes; they can still talk to the agent.
