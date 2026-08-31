# MVP-05-T01: Clarification and human takeover

Status: planned  
Story: MVP-05  
Depends: MVP-02-T02, MVP-04-T01

## Spec

Pi asks a concise CLI question when required information is missing. Takeover focuses the exact owned tab. Resume starts from a fresh observation.

## Possible

`ctx.ui.input` / `confirm` / `select` are blocking TUI prompts. In tests we inject an `AskUser` function. Focusing a tab is `bringToFront`; we cannot raise the OS window reliably from CI.

## Do

- `browser_ask_user`: prompt, record Q&A, optional write to candidate knowledge as unapproved `user_fact`
- `browser_takeover` / `/browser-takeover`: focus tab, set attention `awaiting_takeover`
- `browser_resume` / `/browser-resume`: lock on, inspect, clear attention
- Status command lists attention items

## Tests

- Fake UI input returns an answer that is stored on the run
- Takeover sets status and rejects subsequent click until resume
- Resume event is followed by an observation event with a new id

## Done when

The handoff loop is observable in the run log: ask or takeover → user → resume observation.
