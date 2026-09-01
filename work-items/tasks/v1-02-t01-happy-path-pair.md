# V1-02-T01: Happy-path pair

Status: planned  
Story: V1-02  
Depends: V1-01-T01

## Spec

Logged-in user issues a one-time pair code, the helper exchanges it for a device token, connects to `/node`, and the API reports Connected. The user never sees `BSA_TOKEN`.

## Possible

`POST /pair/issue` (session) → short-lived code. Helper (existing `browser-session-node` on Linux CI) `POST /pair/exchange` → device token. `/node` hello uses that token. Status/health includes `node: connected` and account id.

## Do

- Pair issue + exchange endpoints
- Device token scoped to the account
- Node hello accepts device token
- Chat/UI “Connected” reflects node presence for that account

## Tests

`tests/e2e/v1-02-pair.test.ts`

- Login → issue code → helper exchange → `/node` hello
- API/UI reports Connected for that user
- No `BSA_TOKEN` in helper env or exchange body

## Done when

The Linux helper process pairs and shows Connected using only a one-time code.
