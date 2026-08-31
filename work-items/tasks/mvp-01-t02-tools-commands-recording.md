# MVP-01-T02: Tools, commands, and scoped recording

Status: planned  
Story: MVP-01  
Depends: MVP-01-T01, MVP-02-T01

## Spec

Operator-facing commands list runs, worker health, sessions (tabs), and attention items. Browser tools are registered at load, swapped in for a run, and every tool call is scoped to a `runId` and appended to that run’s event log.

## Possible

`pi.registerTool` + `pi.setActiveTools` can hide `bash`/`read`/`write`/`edit`. Tool `execute` receives `ctx`; we still pass `runId` in tool params (or default to the session’s current run) so logs stay explicit.

## Do

- Commands: `/browser-start`, `/browser-status`, `/browser-runs`, `/browser-stop`
- Tools listed in `docs/architecture.md`
- On start: save previous active tools, `setActiveTools(browserTools)`
- On stop/complete: restore previous tools
- Reject tool calls without a live run or with a mismatched `runId`
- Record tool name, params (redact `type` values that look like passwords), and result summary

## Tests

- Fake API: start swaps tools; stop restores them
- Execute `browser_inspect` without a run → error event, no worker action
- Successful inspect writes a recorded `tool` event on the run

## Done when

Acceptance criteria for MVP-01 are covered by unit tests on the fake API plus run-store assertions.
