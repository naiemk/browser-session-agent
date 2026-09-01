---
id: PRE-06-T01
title: vibed-infra host + no Chromium on API
story: PRE-06
epic: pre-v1
status: planned
---

# PRE-06-T01 — vibed-infra host + no Chromium on API

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md) — VPS pack, D11
- [docs/web-operator.md](../../docs/web-operator.md) — vibed-infra

## Possible

- `deploy/vibed/vibed-infra-config.yml`
- `deploy/docker/Dockerfile.api`
- `deploy/vibed/gateway.conf`

## Do

1. Pack is ui + api + gateway only. `BSA_HOST=agent.trustless-commerce.com` (or equivalent host string in vibed config).
2. API image has no Playwright/Chromium (already true in `Dockerfile.api` — keep it that way; test asserts it).
3. Health `/healthz`. Persisted `/data` for accounts + `BSA_AGENT_DIR`. LLM keys on api only. GHCR images. TLS via vibed-infra.
4. This task is pack contracts, not applying the pack on the VPS in CI.

## Tests

`tests/e2e/pre-v1-06-vibed-pack.test.ts`

## Done when

Host string, three-service pack, and no Chromium on the API image are asserted. `/healthz` is on the gateway path. Test is in CI.
