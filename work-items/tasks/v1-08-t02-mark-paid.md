# V1-08-T02: Mark paid

Status: planned  
Story: V1-08  
Depends: V1-08-T01, V1-03-T01

## Spec

`POST /billing/mark-paid` (test auth or webhook stub) marks the account paid. Start-run then succeeds against a paired helper.

## Possible

Test-only header or shared test secret. Production webhook can call the same internal “mark paid” later. Do not implement full Stripe checkout in this task.

## Do

- Mark-paid endpoint (guarded)
- Paid account passes the V1-03 start-run path
- Idempotent mark-paid

## Tests

`tests/e2e/v1-08-mark-paid.test.ts`

- Unpaid start-run fails
- Mark-paid → start-run + inspect on fixture succeeds
- Second mark-paid is ok

## Done when

A paid flag is the only switch between T01 refusal and V1-03 success.
