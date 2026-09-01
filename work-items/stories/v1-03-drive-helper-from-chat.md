# V1-03: Drive My Browser From Chat

Status: planned

As a connected user, I start a goal in chat and the hosted agent inspects and acts on the helper’s Chromium.

## Acceptance criteria

- After pairing, a chat `/browser-start` (or equivalent) owns a run on the helper.
- `browser_inspect` returns URL, title, and semantic refs from the helper’s tab (fixture site).
- Type/click through chat tools mutates the fixture; the next observation shows the change.
- The API process does not launch Playwright Chromium (D11).

## Decisions

See `docs/decisions.md` D5, D11, D16. Same `BrowserSession` tools as the CLI.

## Tasks

- [V1-03-T01](../tasks/v1-03-t01-start-and-inspect.md)
- [V1-03-T02](../tasks/v1-03-t02-act-on-the-helper.md)

## Tests

Signed-in + paired + fixture HTTP server + helper child. See `docs/test-design.md` (V1-03).
