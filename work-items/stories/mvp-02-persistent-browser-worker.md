# MVP-02: Persistent Browser Worker

Status: planned

As an operator, I have a visible Chromium profile that persists across runs.

## Acceptance criteria

- Playwright launches or reconnects to one dedicated user-data-dir (headed by default, headless in tests).
- Tabs have stable `tabId` values and run ownership; cross-run actions fail with `ownership_error`.
- Takeover focuses the owned tab, releases the exclusive agent lock, and blocks further agent actions until resume.

## Decisions

See `docs/decisions.md` D3, D4, D9, D10.

## Tasks

- [MVP-02-T01](../tasks/mvp-02-t01-persistent-worker.md)
- [MVP-02-T02](../tasks/mvp-02-t02-tab-ownership-takeover.md)

## Tests

Cookie-preserving relaunch, CDP reconnect, ownership rejections, takeover lock. See `docs/test-design.md`.
