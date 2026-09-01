# V1-02: Pair This Computer

Status: planned

As a signed-in user, I connect this computer and see **Connected** without ever seeing `BSA_TOKEN`.

## Acceptance criteria

- Happy path: one-time `bsa://pair?code=` → exchange → device token → helper `/node` hello → UI/API reports Connected.
- Fallback: helper localhost challenge + logged-in **Allow this computer** reaches the same Connected state.
- Codes expire in minutes and bind to the issuing account. Another account cannot redeem them.
- Revoking the device rejects the next hello. A copied helper binary with no stored credential cannot attach to someone else’s account.
- Quitting the helper fails browser tools with a stable `helper_disconnected` code; chat still answers.
- Starting the helper again with the stored device credential reconnects.

## Decisions

See `docs/v1.md` pairing and `docs/decisions.md` D15. Do not bake long-lived secrets into the installer.

## Tasks

- [V1-02-T01](../tasks/v1-02-t01-happy-path-pair.md)
- [V1-02-T02](../tasks/v1-02-t02-localhost-fallback.md)
- [V1-02-T03](../tasks/v1-02-t03-pairing-security.md)
- [V1-02-T04](../tasks/v1-02-t04-disconnect-and-reconnect.md)

## Tests

In-process API + node-agent child process on Linux CI. See `docs/test-design.md` (V1-02).
