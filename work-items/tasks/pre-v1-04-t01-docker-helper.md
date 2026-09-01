---
id: PRE-04-T01
title: Docker node pair without BSA_TOKEN
story: PRE-04
epic: pre-v1
status: done
---

# PRE-04-T01 — Docker node pair without `BSA_TOKEN`

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md) — Docker Playwright helper, device token, `BSA_HOME`
- [docs/web-operator.md](../../docs/web-operator.md) — desktop node

## Possible

- `deploy/docker/compose.node.yml`
- `scripts/run-desktop-node.sh`
- `src/hosts/node/main.ts` / pairing client
- `tests/helpers/v1.ts` — spawn helper for pair/reconnect behavior

## Do

1. Compose and `run-desktop-node.sh` do **not** require `BSA_TOKEN`. Pair with `BSA_PAIR_CODE` (or localhost claim); store device credential under bind-mounted `BSA_HOME`.
2. Restart reconnects with the stored device token. Image `ghcr.io/naiemk/browser-session-node`. Headless + live view default (D14). No MSI/pkg.
3. Pair/reconnect behavior may reuse the spawned helper in tests; compose/script contracts are file assertions.

## Tests

`tests/e2e/pre-v1-04-docker-helper.test.ts` (compose/script contracts; pair/reconnect may reuse spawn helper).

## Done when

Docker helper path has no required `BSA_TOKEN`. Device credential persists on `BSA_HOME`. Named test is in CI.
