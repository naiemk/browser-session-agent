# browser-session-agent

Local Pi-powered browser operator: a CLI goal drives one visible persistent Chromium profile through bounded Playwright tools, pauses for the user, and resumes from observed browser state.

## Status

MVP is being implemented from the work items in `work-items/`. Product boundary: `docs/mvp.md`. Runtime spec: `docs/architecture.md`.

## Use with Pi

```bash
npm install
npx playwright install chromium
pi install -l git:github.com/naiemk/browser-session-agent
pi
# /browser-start Apply to the example role on the open tab
```

For local checkout without `pi install`:

```bash
pi -e ./src/extension.ts
```

## Development

```bash
npm test          # unit, integration, and prompt E2E (CI gate)
npm run e2e:jsonlint          # same JSONLint prompt against the local fixture
npm run e2e:jsonlint -- --live  # optional dry run against jsonlint.com
```

Headed operator runs use `~/.browser-session-agent/profile`. Tests use a temp directory and headless Chromium. GitHub Actions workflow `.github/workflows/ci.yml` installs Playwright Chromium and runs `npm test`.

## Web chat + desktop node

The VPS runs chat + Pi (`npm run start:api`). The desktop runs Playwright Chromium and connects outbound (`npm run start:node -- --api ws://…/node`). See `docs/web-operator.md`.

```bash
BSA_TOKEN=dev npm run start:api
BSA_TOKEN=dev npm run start:node -- --api ws://127.0.0.1:8787/node
# open http://127.0.0.1:8787/?token=dev
```
