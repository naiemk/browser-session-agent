# V1-04: Live View and Takeover

Status: planned

As a user, I watch the page, take over for login/CAPTCHA, then resume from a fresh observation.

## Acceptance criteria

- After a run starts, the chat client receives at least one screencast or snapshot JPEG for the fixture tab.
- Remote pointer/key events are accepted only while `awaiting_takeover`.
- While takeover is active, agent `act` is rejected.
- Resume writes a new observation before the next act is allowed.
- Input while not in takeover is ignored.

## Decisions

See `docs/v1.md` live view, `docs/decisions.md` D10, D16, D17. JPEGs are for humans, not the model.

## Tasks

- [V1-04-T01](../tasks/v1-04-t01-live-view.md)
- [V1-04-T02](../tasks/v1-04-t02-takeover-and-resume.md)

## Tests

Extend the web-node integration path: frames on the chat WS, takeover lock, resume observation id. See `docs/test-design.md` (V1-04).
