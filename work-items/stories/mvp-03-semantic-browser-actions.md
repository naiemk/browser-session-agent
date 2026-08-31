# MVP-03: Semantic Browser Observation and Actions

Status: planned

As Pi, I can understand the current page and take bounded semantic actions.

## Acceptance criteria

- Page summaries include URL, title, ref-tagged accessible controls, dialogs, errors, and recent changes versus the last snapshot.
- Actions support navigate, click, type, select, scroll, and wait; locators are refs, not CSS.
- Every action returns a fresh observation and a verification result (`passed` | `failed` | `inconclusive`).

## Decisions

See `docs/decisions.md` D5.

## Tasks

- [MVP-03-T01](../tasks/mvp-03-t01-semantic-observation.md)
- [MVP-03-T02](../tasks/mvp-03-t02-bounded-actions-verification.md)

## Tests

Fixture pages for apply/login/dialog/error/dynamic. See `docs/test-design.md`.
