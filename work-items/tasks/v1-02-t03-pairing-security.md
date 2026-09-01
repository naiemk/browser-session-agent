# V1-02-T03: Pairing security

Status: done  
Story: V1-02  
Depends: V1-02-T01

## Spec

Expired codes, another account’s codes, and revoked device tokens are rejected. A helper binary with no stored credential cannot attach to someone else’s account.

## Possible

Codes expire in minutes (tests use a short TTL or a clock hook). Revoke is `POST /devices/:id/revoke` (session). Node hello after revoke fails closed.

## Do

- TTL and account bind on pair codes
- Device list + revoke
- Reject `/node` hello with missing, foreign, or revoked token

## Tests

`tests/e2e/v1-02-pair-security.test.ts`

- Expired code → exchange 401/410
- Account B cannot redeem account A’s code
- Revoke → next helper hello rejected
- Helper with empty credential store does not become Connected on account A

## Done when

The security cases are CI-failing if any of the above succeed incorrectly.
