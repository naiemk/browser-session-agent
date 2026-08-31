# MVP-04-T01: Evidence, recovery notes, durable resume

Status: done  
Story: MVP-04  
Depends: MVP-03-T02

## Spec

Runs persist observations, actions, screenshots, and errors. Failed actions get a recovery note from new evidence. A new worker client resumes from `state.json` plus live browser state.

## Possible

JSONL append is crash-friendly. Screenshots are optional per action (`screenshot: "always" | "on_fail" | "never"`, default `on_fail` plus inspect). Resume must not replay the event log as Playwright actions.

## Do

- `RunStore.append` + `load` + `screenshot`
- Recovery note template: expected vs actual URL/text/ref/dialog/console
- `state.json`: status, currentRun fields, tab map, lastObservationId
- Resume: reconnect worker, hydrate tab ids from open pages + state, next inspect is live

## Tests

- After a failed expect, events include `recovery` with cited actual URL or missing text
- Screenshot file exists on failed action
- Kill worker, new worker from same `BSA_HOME`, inspect returns the fixture page still open (reconnect) or the restored profile session

## Done when

An operator can read `events.jsonl` and know what was seen, done, and why the run stopped, then continue after restart.
