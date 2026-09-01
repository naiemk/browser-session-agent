# PRE-06: VPS Pack (vibed-infra)

Status: planned

As the operator, I apply the vibed-infra pack on the VPS and get TLS UI + API + gateway for `agent.trustless-commerce.com`, with LLM keys and persisted data, and no Chromium on that box.

## Acceptance criteria

- Pack is ui + api + gateway only (`deploy/vibed/`). `nodes: []`.
- Host string is `agent.trustless-commerce.com`.
- API image/config: no Playwright/Chromium; `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` (or equivalent) remains.
- LLM keys (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY`) are api env, not baked into images.
- Persisted volume covers accounts and Pi agent/session dirs (`BSA_HOME` / `BSA_AGENT_DIR` / `BSA_SESSION_DIR`).
- `/healthz` is the API health check.
- GHCR images from CI are the intended runtime (`browser-session-api`, `browser-session-ui`).

## Decisions

See `docs/pre-v1.md`, `docs/web-operator.md`, D11. Live apply on the VPS is a release step; CI asserts configs.

## Tasks

- [PRE-06-T01](../tasks/pre-v1-06-t01-vibed-pack.md)

## Tests

File assertions on vibed YAML, Dockerfiles, and gateway. See `docs/test-design.md` (PRE-06).
