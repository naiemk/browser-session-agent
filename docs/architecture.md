# Architecture — MVP Browser Operations Agent

This is the working spec for the MVP. V1 capabilities (supervisor graph, parallel subagents, email) are out of scope.

## Outcome

A local Pi package drives one visible persistent Chromium profile through bounded Playwright tools. A CLI goal can pause for the user, then resume from observed browser state with an evidence log.

## System

```
Pi CLI (extension + commands)
        │  tools / ctx.ui / setActiveTools
        ▼
BrowserSession (run orchestration)
        │
        ├─► BrowserWorker (Playwright persistent Chromium)
        ├─► RunStore (JSONL events, screenshots, state.json)
        └─► KnowledgeStore (candidates + approved records)
```

The worker and stores are Pi-independent. The extension is a thin adapter that registers tools and commands.

## Runtime layout

Default data root: `~/.browser-session-agent/` (override with `BSA_HOME`).

```
~/.browser-session-agent/
  profile/                 Chromium user-data-dir
  worker.json              CDP endpoint, pid, startedAt
  runs/<runId>/
    state.json
    events.jsonl
    screenshots/
  knowledge/
    records.jsonl
```

Project-local override: `.browser-session-agent/` in the working directory when `BSA_HOME` is unset and that folder exists.

## Pi integration (what is possible)

Confirmed against Pi coding-agent extension docs (`@earendil-works/pi-coding-agent`):

| Need | Mechanism |
| --- | --- |
| Native tools | `pi.registerTool()` with TypeBox schemas |
| Replace coding tools for a run | `pi.setActiveTools(browserToolNames)` while a run is active |
| Slash commands | `pi.registerCommand()` |
| CLI questions | `ctx.ui.input()`, `select()`, `confirm()` |
| Operator guidance | `before_agent_start` system-prompt append + tool `promptGuidelines` |
| Session-adjacent UI state | `pi.appendEntry()` (not a substitute for the run store) |
| Package install | `package.json` `pi.extensions` + `pi-package` keyword |

Pi loads TypeScript via jiti, so the extension entry can stay `src/extension.ts`.

We do **not** wrap BetterWright or `pi-browser-harness`. BetterWright executes model-authored Playwright JavaScript (MVP excludes unrestricted scripting). The harness attaches to an existing Chrome via CDP (different ownership and evidence model). We own one dedicated profile.

## Worker

- Launch: `chromium.launchPersistentContext(profileDir, { headless: false, args: ['--remote-debugging-port=N'] })`.
- Reconnect: if `worker.json` has a live CDP endpoint, `chromium.connectOverCDP`. If the browser is gone, relaunch the persistent context.
- Tests use a temp profile and `headless: true`.
- The browser remains open across Pi reloads so the user can keep a login. `session_shutdown` does not close Chromium unless `/browser-stop` is used.

## Tab ownership

Each Playwright page gets a stable `tabId`. A run may own tabs. Agent actions require `runId` + `tabId` and fail if:

- the tab is unowned
- the tab is owned by a different run
- the run is `paused` or `awaiting_takeover` (exclusive lock released)

User-opened tabs stay unowned until a run claims them.

## Observation and actions

Observation is a compact semantic snapshot, not a raw DOM dump:

- URL, title, tabId
- interactive controls with sequential refs (`e1`, `e2`, …)
- open dialogs and alert roles
- page/console errors
- a short diff against the previous snapshot for that tab

Actions are bounded: `navigate`, `click`, `type`, `select`, `scroll`, `wait`. Clicks and typing target refs from the latest observation, which re-tags the DOM immediately before the action.

Every action carries an optional `expect` clause. After the action, a fresh observation is checked and the result is `passed` | `failed` | `inconclusive`.

## Evidence and recovery

Every observation, action, error, handoff, and recovery note is appended to `events.jsonl`. Screenshots are stored beside the run. `state.json` is the resume cursor: status, owned tabs, last observation ids, attention items.

If an action fails verification, the worker writes a recovery note that cites the new evidence (URL change, missing ref, dialog, console error) instead of retrying blindly.

Worker restart reloads `state.json` and reconnects the browser. The next inspect/act uses current page state, not a replayed action log.

## Human handoff

- Missing information → `browser_ask_user` / `/browser-ask` via `ctx.ui.input`.
- Login or CAPTCHA-like UI → takeover: bring the owned tab to front, set status `awaiting_takeover`, stop agent actions.
- Resume → `/browser-resume` or `browser_resume` takes a fresh observation and continues.

We do not solve CAPTCHAs or fill a credential vault in MVP. The user types in the visible browser.

## Candidate knowledge

Records are append-only JSONL:

- `user_fact` — requires explicit approval before retrieve
- `strategy` — linked to a successful run outcome; retrievable once the run completed

Retrieval is lexical overlap against the current goal and page URL/title. No embeddings and no silent prompt/code mutation.

## Tool and command surface

**Commands:** `/browser-start`, `/browser-status`, `/browser-runs`, `/browser-pause`, `/browser-resume`, `/browser-takeover`, `/browser-stop`, `/browser-approve`, `/browser-knowledge`.

**Tools (active during a run):** `browser_inspect`, `browser_navigate`, `browser_click`, `browser_type`, `browser_select`, `browser_scroll`, `browser_wait`, `browser_ask_user`, `browser_takeover`, `browser_resume`, `browser_knowledge_search`, `browser_knowledge_propose`.

While a run is active, coding tools (`bash`, `read`, `write`, `edit`, …) are removed from the active set. `/browser-stop` or run completion restores them.
