# V1-04-T02: Takeover and resume

Status: planned  
Story: V1-04  
Depends: V1-04-T01

## Spec

Remote pointer events are accepted only while `awaiting_takeover`. Agent `act` is rejected during takeover. Resume inspects before the next act. Input while not in takeover is ignored.

## Possible

Existing takeover lock in `tests/integration/web-node.test.ts`. Repeat through the consumer session (account + pair), not `BSA_TOKEN`.

## Do

- Takeover sets `awaiting_takeover` and unlocks remote input
- Act while takeover → rejected
- Pointer while not takeover → ignored
- Resume → new observation id → act accepted

## Tests

`tests/e2e/v1-04-takeover.test.ts`

- Takeover → pointer accepted
- Act rejected until resume
- Pointer before takeover ignored
- Resume observation id ≠ last pre-takeover observation; then act succeeds

## Done when

The takeover lock is proven on the hosted chat + helper path.
