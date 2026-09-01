---
id: PRE-03-T01
title: Gateway API prefixes
story: PRE-03
epic: pre-v1
status: done
---

# PRE-03-T01 — Gateway API prefixes

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md) — TLS origin, gateway must not 404 `/auth` `/me` `/pair`
- [docs/web-operator.md](../../docs/web-operator.md) — vibed-infra gateway

## Possible

- `deploy/vibed/gateway.conf`
- `deploy/vibed/vibed-infra-config.yml`
- Local nginx in the test, or documented route-table assertions on those files

## Do

1. Gateway forwards `/auth`, `/me`, `/pair`, `/devices` (and existing `/chat`, `/node`, `/healthz`) to the API, not static UI.
2. `/` still serves the UI. WebSockets `/chat` and `/node` still upgrade through the gateway.
3. File assertions plus a local nginx check **or** a documented route table that the test parses from the conf.

## Tests

`tests/e2e/pre-v1-03-gateway-routes.test.ts` (file assertions + local nginx or documented route table).

## Done when

Those prefixes cannot 404 on the static UI in the vibed pack. The named test is in CI.
