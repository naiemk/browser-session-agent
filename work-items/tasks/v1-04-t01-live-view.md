# V1-04-T01: Live view

Status: done  
Story: V1-04  
Depends: V1-03-T01

## Spec

After a run starts, the chat client receives at least one screencast or JPEG snapshot for the fixture tab. Frames are for humans, not the model.

## Possible

Existing CDP screencast relay in the web-node integration test. Subscribe the chat WS (or a live-view channel) as the signed-in user, not only as the node.

## Do

- Start live view when the run begins and on each chat connect
- Relay frames from the helper; CDP stays on the desktop

## Tests

`tests/e2e/v1-04-live-view.test.ts`

- Paired start on a fixture URL
- Chat/live client receives ≥1 JPEG/base64 frame
- Frame is associated with the run’s tab

## Done when

A signed-in chat session can see the helper tab without a headed window.
