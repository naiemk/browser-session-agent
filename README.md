# browser-session-agent

A browser agent that works the way a good coding agent works: look before acting, verify
every action, ask when something is genuinely unknown, and never claim success the page
does not support.

Three local entry points, for three different jobs. None of them need the VPS.

## `browser-agent` — run a goal, get a verified answer

Non-interactive. You state a goal and the criteria that decide whether it worked; the
agent drives Chromium and the criteria are evaluated in code against the live page, not
taken from the agent's report.

```bash
npm install
npx playwright install chromium

npm run agent -- run "apply for the staff engineer role" \
  --url https://example.test/jobs \
  --criterion "text_visible:Application submitted" \
  --policy ask
```

It exits non-zero unless the criteria pass, so it composes in a shell. Irreversible
actions (submit, send, pay, delete) need approval by default, so an unattended run cannot
commit something by surprise — pass `--policy auto` when you mean it.

```bash
npm run suite                 # 26-task regression suite, no tokens spent
npm run suite:live            # paid competence check on a small subset
npm run agent -- replay <goalId>   # read back what a run actually did
```

Needs a provider key for `run` and `suite:live`: export `OPENROUTER_API_KEY` (or
`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`). `npm run suite` needs none.

Design and layering: [docs/runtime.md](docs/runtime.md).

## `npm run web` — chat UI on this machine (dev, no VPS)

Control the operator from the chat UI. Chromium runs here. Nothing pairs to the hosted API.

```bash
export OPENROUTER_API_KEY=...   # or ANTHROPIC_API_KEY / OPENAI_API_KEY
npm run web
```

Open the printed URL (`http://127.0.0.1:8787/?token=dev`). The desktop node is already
connected — no pair installer.

In the chat: `/browser-start Apply to the example role on the open tab`.

`npm run web -- --check` verifies Node and Playwright Chromium. `--headless` hides the
window. `--port 8787` changes the listen port.

Do not run `npm run cli` or `npm run agent` against the same profile while the web stack
is open.

## `bsa` — interactive Pi session (dev, no VPS)

An interactive Pi TUI with the in-repo browser extension, driving Chromium on this
machine. Useful when you want to steer the agent yourself rather than hand it a goal.

```bash
npm run cli
```

`npm run cli -- --check` verifies Node, Pi, the extension, and Playwright Chromium.

In the TUI:

```
/login
/browser-start Apply to the example role on the open tab
```

`/login` is a one-time Pi provider login (OpenRouter, Anthropic, OpenAI, or ChatGPT), or
export a key instead. Headed Chromium uses `~/.browser-session-agent/profile`; pass
`--headless` (or `BSA_HEADLESS=1`) to hide the window. Extra args after `--` go to Pi
(`--print`, `--model`, …).

Do not run `npm run web` or `npm run start:node` against the same profile while this is
open.

## Hosted UI (VPS, optional)

The VPS serves the web chat UI and API only; it never launches Chromium. Pair a desktop
for that:

```bash
curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=<code> bash
```

Local one-machine UI trial:

```bash
cp .env.example .env
docker compose -f deploy/docker/compose.local.yml up --build
# http://127.0.0.1:8080/ — register, then Pair this computer
```

Pre-V1 apply: [docs/pre-v1-runbook.md](docs/pre-v1-runbook.md). Operator notes:
[docs/web-operator.md](docs/web-operator.md).

## Development

```bash
npm run precommit         # everything CI gates on, in CI's order
npm run optimize:check    # cost against the committed baseline, attributed by payload
npm test                  # unit, integration, and end-to-end
npm run typecheck         # core, runtime, suite, and CLI
npm run suite:reference   # validates the suite tasks themselves
npm run suite             # the agent loop end to end, mock model, no tokens
```

Run `npm ci` rather than `npm install` before `precommit` when you want to be sure of a
result. npm hoists transitive dependencies when nothing conflicts, so a stale or
`npm install`-shaped `node_modules` can resolve imports that CI cannot — which is exactly
how two undeclared dependencies and a broken 0.84 API migration reached CI green-looking
locally. A test now checks that everything `src/` imports is declared.

Tests never call a model. The agent loop is exercised through a mock that speaks the same
stream protocol a provider does, so the real browser, real tools, real verification, and
real commit gate are all covered for nothing — and CI asserts no provider key is present,
so a green build cannot quietly depend on a paid call.

Paid runs are deliberately separate: the **Live baseline** workflow is triggered by hand
and reports tokens and cost per task.

Runs meter themselves: `browser-agent metrics <goalId>` says where a run's context went,
what it bought twice, and whether the prompt cache was being invalidated. Cost is reported
and attributed, never gated — see [docs/optimization.md](docs/optimization.md).

How a page is described to the model is a strategy, so a cheaper description can be
measured rather than argued about:

```bash
browser-agent suite --view flat     # the baseline: a control list as JSON objects
browser-agent suite --view table    # the default: the same list as tab-separated rows
BSA_VIEW=flat npm run cli           # put the baseline back in a chat, which has no flags
```

### Reading a run

Every run — a suite task, a `browser-agent run`, a chat in either CLI — files itself under
`~/.browser-agent-core/goals/<goalId>/`:

| File | What it is | Keep? |
| --- | --- | --- |
| `events.jsonl` | Evidence: intent, before, action, after, outcome. Redacted and capped, meant to be readable later. | Yes |
| `metrics.jsonl` | What it cost: tokens, cache split, context bytes per turn. | Yes |
| `payloads.jsonl` | Every byte the model was sent, verbatim. Large. | Only to debug |
| `artifacts/` | Screenshots and checkpoints. | Yes |

The terminal shows one line per step (`observe instagram.com/vika — 38 controls, 2 dialogs`)
because the full payload is in `payloads.jsonl`. In the local CLI, `/browser-evidence`
prints the current session's directory.

Design notes: [docs/runtime.md](docs/runtime.md) ·
[docs/optimization.md](docs/optimization.md) ·
[docs/autonomous-agent.md](docs/autonomous-agent.md) ·
[docs/decisions.md](docs/decisions.md)
