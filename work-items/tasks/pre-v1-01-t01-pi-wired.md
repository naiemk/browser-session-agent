---
id: PRE-01-T01
title: Pi starts when BSA_NO_PI unset
story: PRE-01
epic: pre-v1
status: planned
---

# PRE-01-T01 — Pi starts when `BSA_NO_PI` unset

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md) — real agent, no stub in production
- [docs/web-operator.md](../../docs/web-operator.md) — `OperatorRuntime.start` → `createAgentSession`
- [docs/architecture.md](../../docs/architecture.md) — Pi session, D12 model routing

## Possible

- `src/hosts/web/runtime.ts` — `start()` currently stubs when `BSA_NO_PI` is set
- `src/pi/session.ts` — `createAgentSession`
- `src/pi/models.ts` — authenticated provider model list
- `deploy/docker/Dockerfile.api` / `deploy/vibed/vibed-infra-config.yml` — production env must omit `BSA_NO_PI`

## Do

1. With `BSA_NO_PI` **unset** and no live LLM required: starting a run still builds a Pi session (or a documented test double that is **not** the `"I heard you:"` stub).
2. Assert the session is wired with `browser_*` tools including `browser_run_plan` and `browser_fill`.
3. Production image/env contracts: `BSA_NO_PI` is not set on the API service. CI continues to set `BSA_NO_PI=1` for the default `npm test` gate where tests still use the stub.
4. Mock or skip the live LLM call so this test stays CI-runnable.

## Tests

`tests/e2e/pre-v1-01-pi-wired.test.ts` (assert session/tools; mock or skip live LLM).

## Done when

`BSA_NO_PI` unset no longer means “no agent.” Production env omits the stub flag. The test file exists and is in the `npm test` glob.
