# V1-07-T01: Helper binary pairing

Status: planned  
Story: V1-07  
Depends: V1-02-T01

## Spec

The node helper pairs, stores a device credential in a keychain abstraction, connects, and survives process restart without `BSA_TOKEN` in the environment. Runs on Linux CI.

## Possible

`CredentialStore` interface: OS keychain on Win/Mac, file-backed fake in tests (`BSA_CREDENTIAL_STORE=file`). Helper CLI: pair (code or localhost) then connect. Profile dir under a home that tests can point at (`BSA_HOME`).

## Do

- Credential store + helper pair command
- No `BSA_TOKEN` required
- Restart reads the stored device token and reconnects

## Tests

`tests/e2e/v1-07-helper-binary.test.ts`

- Helper env has no `BSA_TOKEN`
- Pair via issued code → Connected
- Kill and relaunch helper → Connected with the same store
- Store file/keychain payload is not a user password

## Done when

The consumer helper path is the node binary + device credential, proven on Linux.
