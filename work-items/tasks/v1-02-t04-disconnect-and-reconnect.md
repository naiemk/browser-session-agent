# V1-02-T04: Disconnect and reconnect

Status: planned  
Story: V1-02  
Depends: V1-02-T01

## Spec

Killing the helper fails browser tools with `helper_disconnected`; chat still answers. Starting the helper again with the same device token restores Connected and tools.

## Possible

Existing fail-closed path in web-node tests. Reuse device token from T01 (file or fake keychain). Chat WS stays up on the API.

## Do

- Stable error code `helper_disconnected` on inspect/act when the node is gone
- Chat prompt still returns `agentEvent`
- Re-hello with the same device token → Connected; inspect works again

## Tests

`tests/e2e/v1-02-reconnect.test.ts`

- Paired helper → kill process → inspect/act → `helper_disconnected`
- Same chat session still receives an `agentEvent`
- Relaunch helper with stored token → Connected → inspect succeeds

## Done when

Quit and resume are observable without issuing a new pair code.
