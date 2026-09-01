# V1-02-T02: Localhost fallback

Status: done  
Story: V1-02  
Depends: V1-02-T01

## Spec

When `bsa://` cannot run, the helper listens on `127.0.0.1` with a challenge. The already-logged-in site claims the device. Result is the same Connected state.

## Possible

Helper `GET/POST` on localhost or helper polls `/pair/claim`. Logged-in `POST /pair/claim` with `challenge` issues the device token to the helper. No custom-scheme hop in this test.

## Do

- Helper challenge listener (or poll)
- Claim endpoint bound to the signed-in account
- Same device-token + `/node` hello as T01

## Tests

`tests/e2e/v1-02-pair-localhost.test.ts`

- Start helper without exchanging a `bsa://` code
- Logged-in claim → helper stores device token → Connected
- Challenge cannot be claimed by a second account

## Done when

Allow-this-computer without a custom URL scheme reaches Connected.
