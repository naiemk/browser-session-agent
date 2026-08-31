# MVP-05: Interactive Clarification and Human Handoff

Status: planned

As a user, I can answer focused questions and unblock a paused browser task.

## Acceptance criteria

- Pi asks concise CLI questions (`ctx.ui.input` / confirm / select) when required information is missing; Q&A is stored on the run.
- Takeover focuses the owned browser tab and sets attention `awaiting_takeover`.
- Resume takes a fresh page observation before the next action.

## Decisions

See `docs/decisions.md` D10 (no credential vault / CAPTCHA solver).

## Tasks

- [MVP-05-T01](../tasks/mvp-05-t01-clarification-handoff.md)

## Tests

Fake UI prompt, takeover lock, resume observation id. See `docs/test-design.md`.
