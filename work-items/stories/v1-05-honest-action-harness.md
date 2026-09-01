# V1-05: Honest Action Harness

Status: planned

As a user, I only see an action as done when Playwright succeeded and the page actually changed.

## Acceptance criteria

- Every `act` has a required postcondition (defaults in `docs/v1.md`). The model cannot omit verification.
- A click that throws, hits a missing ref, or produces no snapshot/URL/dialog delta is `failed` / `noop`, never `ok`.
- `type` / `select` accept only when read-back matches. Navigate accepts when the URL matches the intent.
- Chat and tool payloads the UI renders include `verification` and recovery. Assistant prose is not the recorded result.

## Decisions

See `docs/v1.md` action harness and `docs/decisions.md` D17.

## Tasks

- [V1-05-T01](../tasks/v1-05-t01-noop-click-rejected.md)
- [V1-05-T02](../tasks/v1-05-t02-readback-type-select.md)
- [V1-05-T03](../tasks/v1-05-t03-chat-harness-actuals.md)

## Tests

Fixture dead-click and read-back pages; WS tool result shape. See `docs/test-design.md` (V1-05).
