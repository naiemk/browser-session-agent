---
id: AGENT-04-T02
title: Ephemeral observations and a turn cap
story: AGENT-04
epic: agent
status: todo
---

# AGENT-04-T02 — Ephemeral observations and a turn cap

## Spec

- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — observations are ephemeral, distilled facts persist
- [docs/decisions.md](../../docs/decisions.md) — D29 (turn cost discipline)

## Possible

- Pi hook `context` returning `{ messages }` — the supported pruning point, called before every model request
- Pi hook `turn_end` plus `ctx.abort()` — Pi has no built-in step cap
- `src/host/bind-extension.ts` — where hooks are registered today
- `src/hosts/web/hosted-pi.ts` — `normalizeAgentEvent`, loader options

## Do

1. Register a `context` handler that drops superseded `browser_inspect` and `browser_probe` results, keeping the most recent observation per tab plus all check results and all failure bundles.
2. Never prune the task card, criteria text, or user answers.
3. Register a `turn_end` handler that aborts at a configured turn cap and records why, so a capped task is distinguishable from a failed one.
4. Make both extensions, registered on the session, so they can be disabled for an experiment without touching the runtime.
5. Report turns used per task to the suite runner.

## Tests

- `tests/unit/agent-context-hygiene.test.ts` — given a synthetic message list with three inspect results and two check results, pruning keeps the newest inspect and both checks; the task card and criteria survive; disabling the extension leaves messages untouched.
- `tests/unit/agent-turn-cap.test.ts` — the cap aborts at N and the outcome is reported as capped, not failed.

## Done when

Stale observations no longer accumulate in model context, the task card and all checks and failure bundles always survive pruning, a turn cap aborts with a distinguishable outcome, and both are extensions that can be switched off. Both test files are in the `npm test` glob.
