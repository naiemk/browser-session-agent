# Test Design

Tests prove the stories’ observable criteria without a live Pi TUI or real job sites.

V1 consumer tests use an in-process API, a helper child process, and local fixtures. They do not require Clerk, Stripe, signed installers, or live job boards.

# MVP

## Layers

| Layer | Runner | What it covers |
| --- | --- | --- |
| Unit | tsx / node:test | observation compacting, verification, ownership, stores, prompt interpretation |
| Integration | tsx + Playwright headless | worker, actions, evidence, handoff, knowledge |
| Extension contract | fake `ExtensionAPI` | tool/command registration, tool-swap, recording |
| Prompt E2E (CI) | `runBrowserPrompt` + Playwright | One prompt opens JSONLint, validates, prettifies, copies JSON back |
| Manual | headed Pi session | login takeover on a real site |

## Fixture app

`tests/fixtures/site/` is a static HTTP server used by integration tests:

- `/login` — email/password; submitting sets a cookie and redirects to `/jobs`
- `/jobs` — listing with Apply buttons
- `/apply` — multi-field form, required field, modal confirm, success banner
- `/dialog` — blocking `role=dialog`
- `/error` — visible alert + console error
- `/dynamic` — click reveals a new control (snapshot diff)
- `/jsonlint` — JSON editor, Validate JSON, Prettify (prompt E2E)

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

### Prompt E2E (CI gate)

- A single prompt creates unformatted JSON, opens `/jsonlint`, validates, prettifies, and copies formatted JSON back.
- The test never hardcodes control refs; it only supplies the prompt.
- `npm test` includes this case. GitHub Actions runs `npm test` after installing Chromium.

## Non-goals for CI

- Pixel diffs of screenshots
- Real LinkedIn/Indeed/Greenhouse sessions
- Full Pi TUI keypress tests
- Load/performance

---

# V1

Consumer E2E: account session + pair + helper child + fixture site. `BSA_TOKEN` may remain a power-user escape; V1 tests must not require it in the URL or helper env.

## Layers (added)

| Layer | Runner | What it covers |
| --- | --- | --- |
| Account / pair HTTP | tsx + API process | register, session, pair codes, revoke, billing flag |
| Helper child | node-agent subprocess | `/node` hello, fail-closed, reconnect |
| Chat WS | WebSocket client | `agentEvent`, tool cards, progress, live frames |
| Chat UI | Playwright | sign-in form, send message (no `?token=`) |
| Page plans | Playwright + fixture | PlanRuntime, combobox, `browser_run_plan`, `browser_fill` |
| Manifest / artifact | file assertions | `bsa://`, login item, no baked secret |
| Onboarding gate | `tests/e2e/v1-e2e-onboarding.test.ts` | V1 exit criteria in one path |

## Fixture additions

Keep `tests/fixtures/site/` and add:

- `/combobox` — searchable country list; query `?mode=united-states-first|usa-only|scroll-only|none`
- `/dead-click` — button that does not change URL, title, dialogs, or controls (harness no-op)

Pairing and account E2E do not need new HTML.

## Required cases (mapped to tasks)

### Account and chat (V1-01)

- Register → login → `GET /me` → logout; wrong password 401. `tests/e2e/v1-01-session.test.ts`
- Session opens `/chat`, prompt → `agentEvent`; no session rejected. Helper off. `tests/e2e/v1-01-chat.test.ts`
- Playwright UI: sign-in, send message, see reply; URL has no `token=`. `tests/e2e/v1-01-chat-ui.test.ts`

### Pairing (V1-02)

- Issue → exchange → helper hello → Connected; no `BSA_TOKEN`. `tests/e2e/v1-02-pair.test.ts`
- Localhost challenge + claim → Connected. `tests/e2e/v1-02-pair-localhost.test.ts`
- Expired code, foreign account, revoked device, empty store. `tests/e2e/v1-02-pair-security.test.ts`
- Kill helper → `helper_disconnected`, chat lives; relaunch with stored token → Connected. `tests/e2e/v1-02-reconnect.test.ts`

### Drive helper (V1-03)

- Start run on `/apply`; inspect has URL/title/refs; API launched no Chromium. `tests/e2e/v1-03-inspect.test.ts`
- Type/click; next observation shows the mutation. `tests/e2e/v1-03-act.test.ts`

### Live view and takeover (V1-04)

- After start, chat/live client gets ≥1 JPEG. `tests/e2e/v1-04-live-view.test.ts`
- Takeover accepts pointer; act rejected; input ignored before takeover; resume new observation then act. `tests/e2e/v1-04-takeover.test.ts`

### Harness (V1-05)

- `/dead-click` → verification failed, not `ok`. `tests/e2e/v1-05-noop-click.test.ts`
- Type/select read-back accept/reject; navigate URL intent. `tests/e2e/v1-05-readback.test.ts`
- Chat payload the UI renders includes verification + recovery. `tests/e2e/v1-05-harness-chat.test.ts`

### Page plans (V1-06)

- PlanRuntime types a labeled input on Playwright. `tests/e2e/v1-06-plan-runtime.test.ts`
- Four combobox modes including escalate + empty value. `tests/e2e/v1-06-combobox.test.ts`
- `browser_run_plan` streams progress; JS-shaped plan rejected. `tests/e2e/v1-06-run-plan-wire.test.ts`
- `browser_fill` one call; stop on first bad field. `tests/e2e/v1-06-fill.test.ts`

### Helper package (V1-07)

- Helper binary pair + restart, no `BSA_TOKEN` env. `tests/e2e/v1-07-helper-binary.test.ts`
- Manifests: `bsa://`, login item, profile paths, no secret. `tests/e2e/v1-07-installer-contracts.test.ts`
- Unsigned archive contains node entry + Chromium notes. `tests/e2e/v1-07-artifact-layout.test.ts`

### Billing (V1-08)

- Unpaid: chat ok, start-run `payment_required`. `tests/e2e/v1-08-unpaid.test.ts`
- Mark-paid → start-run + inspect succeeds. `tests/e2e/v1-08-mark-paid.test.ts`

### Onboarding gate (V1-E2E)

- Register → pair → start → country plan → takeover → resume → quit helper → disconnected. No hardcoded refs. `tests/e2e/v1-e2e-onboarding.test.ts`
- `npm test` includes this file once implemented.

## V1 non-goals for CI

- Signed/notarized MSI/pkg
- Real Clerk or Stripe
- Cloud-hosted browsers
- Live Greenhouse / LinkedIn / Indeed
- Pixel diffs of live view

# Pre-V1

Pre-V1 is a personal production cut of V1: real Pi agent, TLS at `agent.trustless-commerce.com`, Docker Playwright helper, no billing, no OS installer. Product page: `docs/pre-v1.md`. Epic: `work-items/epics/pre-v1.md`.

Automated tests stay local (in-process API, helper child, fixtures, file assertions). They do not require live LLM keys, the production host, or Docker-in-Docker unless a task explicitly packs compose contracts. Keep `BSA_NO_PI=1` in `npm test` except PRE-01 cases that prove Pi wiring without calling a vendor. Unset `BSA_NO_PI` plus a failed Pi start must **not** emit `"I heard you"`; `/healthz` reports `pi: false`.

## Layers (added)

| Layer | Runner | What it covers |
| --- | --- | --- |
| Pi wiring | tsx + API | `createAgentSession` when `BSA_NO_PI` unset; tools include `browser_run_plan` |
| Unpaid access | tsx + API | start-run without `payment_required`; registration lock |
| Gateway / TLS | file assertions | vibed host, API HTTP prefixes, `Secure` cookie |
| Docker helper | compose/script + pair E2E | no required `BSA_TOKEN`; pair + reconnect |
| Chat UI | Playwright | same-origin sign-in, harness/plan cards, no `?token=` |
| Unpaid onboarding | helper child + fixture | PRE-E2E gate without mark-paid |
| Combobox flake | existing V1-06 | scroll-only click does not detach |

## Required cases (mapped to tasks)

### Hosted agent (PRE-01)

- Pi starts when `BSA_NO_PI` is unset; browser tools including `run_plan`/`fill` are registered. `tests/e2e/pre-v1-01-pi-wired.test.ts`
- A prompt uses browser tools when a helper is connected (scripted/fake Pi — not the stub reply). `tests/e2e/pre-v1-01-agent-tools.test.ts`
- Failed Pi start (no vendor keys / `BSA_PI_FAIL`) keeps the process up, `/healthz` has `pi: false`, chat does not stub `"I heard you"`. `tests/e2e/pre-v1-01-pi-fail-loud.test.ts`

### Personal access (PRE-02)

- Unpaid account: chat ok, `browser-start` succeeds (no `payment_required`). `tests/e2e/pre-v1-02-unpaid-start.test.ts`
- Registration lock rejects further signups. `tests/e2e/pre-v1-02-register-lock.test.ts`

### TLS origin (PRE-03)

- Gateway/vibed configs proxy `/auth` `/me` `/pair` `/devices` `/chat` `/node` `/healthz` to the API. `X-Forwarded-Proto` is not blindly `$scheme`. `tests/e2e/pre-v1-03-gateway-routes.test.ts`
- Session cookie is `Secure` when the request is HTTPS. `tests/e2e/pre-v1-03-tls-cookie.test.ts`

### Docker helper (PRE-04)

- Node compose/script pair without required `BSA_TOKEN`; reconnect from file store. `tests/e2e/pre-v1-04-docker-helper.test.ts`
- Hosted `curl` installer (`/install.sh`, `/install.ps1`) sets up Node/Chromium or Docker and pairs. `tests/e2e/pre-v1-04-wget-install.test.ts`

### Chat UI (PRE-05)

- Same-origin sign-in; URL has no `token=`. Signed-in UI issues a pair code from `/pair/issue`. `tests/e2e/pre-v1-05-chat-ui.test.ts`
- UI/chat payload shows harness verification and plan progress. `tests/e2e/pre-v1-05-harness-plan-cards.test.ts`

### VPS pack (PRE-06)

- vibed-infra host is `agent.trustless-commerce.com`; GHCR images, `/data`, LLM key names, no `BSA_NO_PI`, cookie Secure / proto pass-through; API image/config has no Chromium. `tests/e2e/pre-v1-06-vibed-pack.test.ts`

### Onboarding gate (PRE-E2E)

- Unpaid register → pair → start → country plan → takeover → resume → quit helper → `helper_disconnected`. `tests/e2e/pre-v1-e2e-onboarding.test.ts`
- Combobox `scroll-only` click is stable (harden `tests/e2e/v1-06-combobox.test.ts`).

## Pre-V1 non-goals for CI

- Live hit of `https://agent.trustless-commerce.com` (manual smoke)
- Real model vendor calls
- Signed MSI/pkg, Clerk, Stripe
- Chromium on the VPS


