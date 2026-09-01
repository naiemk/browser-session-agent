# V1-01-T02: Authenticated chat

Status: done  
Story: V1-01  
Depends: V1-01-T01

## Spec

A user session (not `BSA_TOKEN`) opens the chat WebSocket, sends a prompt, and receives an `agentEvent`. No helper is required. Missing session is rejected.

## Possible

`BSA_NO_PI=1` already stubs the agent. Accept the session cookie/JWT on `/chat` in addition to the existing token. Unauthenticated upgrade fails.

## Do

- Chat hello / WS uses the V1-01 session
- Prompt without a helper still returns a stub or model `agentEvent`
- Document that `?token=` is power-user only

## Tests

`tests/e2e/v1-01-chat.test.ts`

- Login → WS `/chat` → prompt → at least one `agentEvent`
- WS without session → 401 or close with auth error
- Helper is not running

## Done when

Consumer chat works with only an account session. Shared `BSA_TOKEN` is not required for this E2E.
