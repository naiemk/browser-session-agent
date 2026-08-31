# Test Design — MVP

Tests prove the stories’ observable criteria without a live Pi TUI or real job sites.

## Layers

| Layer | Runner | What it covers |
| --- | --- | --- |
| Unit | vitest | observation compacting, verification, ownership locks, recovery notes, run/knowledge stores |
| Integration | vitest + Playwright headless | worker launch/reconnect, actions against fixture pages, evidence files, resume cursor |
| Extension contract | vitest with a fake `ExtensionAPI` | tool/command registration, tool-swap on start/stop, ask/takeover/resume wiring |
| Manual | headed Pi session | login takeover on a real site (not gated in CI) |

## Fixture app

`tests/fixtures/site/` is a static HTTP server used by integration tests:

- `/login` — email/password; submitting sets a cookie and redirects to `/jobs`
- `/jobs` — listing with Apply buttons
- `/apply` — multi-field form, required field, modal confirm, success banner
- `/dialog` — blocking `role=dialog`
- `/error` — visible alert + console error
- `/dynamic` — click reveals a new control (snapshot diff)

## Required cases (mapped to tasks)

### Worker and ownership (MVP-02)

- Relaunch with the same user-data-dir restores a cookie set in the previous context.
- CDP reconnect uses `worker.json` when the browser is still alive.
- Action on a tab owned by another run is rejected.
- Action while `awaiting_takeover` is rejected; after resume it is allowed.

### Observation and actions (MVP-03)

- Inspect of `/apply` returns URL, title, refs for inputs/buttons, no raw HTML dump.
- Click/type/select/scroll/wait mutate the fixture as expected.
- `expect.textVisible` passes on the success banner and fails when the banner is absent.
- Snapshot after the `/dynamic` click reports a recent-change line for the new control.

### Evidence and recovery (MVP-04)

- Each inspect/act appends a JSONL event and can write a screenshot file.
- Failed expect produces a recovery note that cites the actual URL or missing text.
- After the worker is closed and reconstructed from `state.json`, inspect returns the current page, not a replay of old actions.

### Handoff (MVP-05)

- `askUser` records the question and answer on the run and does not change the page.
- `takeover` focuses the owned tab (bring-to-front is invoked) and sets `awaiting_takeover`.
- `resume` writes a fresh observation before the next action.

### Knowledge (MVP-06)

- A `user_fact` is not returned by search until approved.
- A completed-run `strategy` is returned when the query overlaps its text.
- Records persist the source run id and event ids.

### Extension (MVP-01)

- Fake Pi API receives the documented tool and command names.
- `startRun` calls `setActiveTools` with only browser tools; `stopRun` restores the previous list.
- Tool execute paths pass `runId` into the session and append a recorded event.

## Non-goals for CI

- Pixel diffs of screenshots
- Real LinkedIn/Indeed/Greenhouse sessions
- Full Pi TUI keypress tests
- Load/performance
