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
npm test
```

Headed operator runs use `~/.browser-session-agent/profile`. Tests use a temp directory and headless Chromium.
