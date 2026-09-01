# V1-05-T03: Chat shows harness actuals

Status: done  
Story: V1-05  
Depends: V1-05-T01, V1-01-T02

## Spec

The tool/WS payload the UI renders includes `verification` and recovery. A stub assistant line claiming success is not the recorded result.

## Possible

After a rejected click (T01), the chat `agentEvent` / tool card JSON contains `verification` and `recovery`. The UI (or a renderer test) prefers that object over assistant text.

## Do

- Tool results on the chat protocol include harness fields
- Static UI tool card reads `verification`, not prose
- Optional: ignore or flag assistant text that contradicts a failed verification

## Tests

`tests/e2e/v1-05-harness-chat.test.ts`

- Rejected act appears on the chat WS with `verification.status !== "passed"`
- Payload the UI uses has recovery text
- A stub assistant message “I submitted the application” is not stored as the action outcome

## Done when

What the user sees as “what happened” is the harness result.
