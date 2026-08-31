# MVP-01: Pi CLI Browser Operations Extension

Status: in_progress

As an operator, I can start and inspect browser runs from Pi CLI.

## Acceptance criteria

- Browser-specific tools replace coding-oriented operations while a run is active, then the previous tool set is restored.
- `/browser-start`, `/browser-status`, and `/browser-runs` show runs, worker health, owned tabs, and attention items.
- Tool calls require a live run, are scoped to that `runId`, and are recorded on the run event log.

## Decisions

See `docs/decisions.md` D1, D6, D7 and `docs/architecture.md` tool/command surface.

## Tasks

- [MVP-01-T01](../tasks/mvp-01-t01-pi-package-scaffold.md)
- [MVP-01-T02](../tasks/mvp-01-t02-tools-commands-recording.md)

## Tests

Fake `ExtensionAPI`: registration, tool swap, scoped recording. See `docs/test-design.md`.
