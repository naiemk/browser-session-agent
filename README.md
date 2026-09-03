# browser-session-agent

Local Pi-powered browser operator: a CLI goal drives one visible persistent Chromium profile through bounded Playwright tools, pauses for the user, and resumes from observed browser state.

## Local CLI (dev, no VPS)

This is the default development path. Chromium and Pi both run on your machine. Nothing pairs to the hosted API.

```bash
npm install
npx playwright install chromium
npm run cli
```

`npm run cli -- --check` verifies Node, Pi, the extension, and Playwright Chromium.

In the TUI:

```
/login
/browser-start Apply to the example role on the open tab
```

`/login` is a one-time Pi provider login (OpenRouter, Anthropic, OpenAI, or ChatGPT). You can also export `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` instead.

Headed Chromium uses `~/.browser-session-agent/profile`. Pass `--headless` (or `BSA_HEADLESS=1`) to hide the window. Extra args after `--` go to Pi (`--print`, `--model`, …).

Do not run `npm run start:node` against the same profile while the CLI is open.

## Hosted UI (VPS, optional)

The VPS serves the web chat UI and API only. It never launches Chromium. Pair a desktop if you want that path:

```bash
curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=<code> bash
```

Local one-machine UI trial (still not the CLI):

```bash
cp .env.example .env
docker compose -f deploy/docker/compose.local.yml up --build
# http://127.0.0.1:8080/ — register, then Pair this computer
```

Pre-V1 apply: `docs/pre-v1-runbook.md`. Operator notes: `docs/web-operator.md`.

## Development

```bash
npm test          # unit, integration, and prompt E2E (CI gate)
npm run e2e:jsonlint          # same JSONLint prompt against the local fixture
npm run e2e:jsonlint -- --live  # optional dry run against jsonlint.com
```

Tests use a temp directory and headless Chromium. GitHub Actions workflow `.github/workflows/ci.yml` installs Playwright Chromium and runs `npm test`.
