---
id: PRE-01-T02
title: Prompt uses browser tools when helper connected
story: PRE-01
epic: pre-v1
status: done
---

# PRE-01-T02 — Prompt uses browser tools when helper connected

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md)
- [docs/architecture.md](../../docs/architecture.md) — bounded tools, D2
- [docs/web-operator.md](../../docs/web-operator.md) — RPC inspect/act/runPlan to helper

## Possible

- `src/hosts/web/runtime.ts` — `createAgentSession` tools
- `src/pi/tools.ts` / `src/pi/session.ts`
- `src/hosts/web/consumer-hub.ts` — helper RPC
- Existing helper spawn in `tests/helpers/v1.ts`

## Do

1. With a connected helper (spawned node or equivalent), a prompt path that is **not** `BSA_NO_PI` stub invokes `browser_*` tools (scripted/fake Pi or recorded tool path).
2. Disconnect still fail-closes browser tools; chat continues without driving the helper.
3. Do not use the `"I heard you:"` stub as the agent under test.

## Tests

`tests/e2e/pre-v1-01-agent-tools.test.ts` (scripted/fake Pi or recorded tool path — not `BSA_NO_PI` stub).

## Done when

A connected helper can be driven from the agent tool path. Disconnect fail-closes tools. The named test is in CI.
