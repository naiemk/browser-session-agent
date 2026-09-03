# AGENT-04: Diagnose failures, keep context clean

Status: todo

As the agent, when an action fails I get the evidence needed to find the cause in one place, and my context does not fill up with page snapshots I no longer need.

## Acceptance criteria

- A failed action returns one capped bundle: recovery note, control delta, console errors, failed network requests, screenshot reference.
- The same bundle is written to the ledger as a single event, redacted per D22.
- A successful action costs nothing extra.
- Superseded inspect and probe results are pruned from model context, keeping the newest observation per tab.
- The task card, criteria text, user answers, all check results, and all failure bundles are never pruned.
- A turn cap aborts a runaway task with an outcome distinguishable from a failure.
- Both pruning and the cap are extensions that can be switched off for an experiment without touching the runtime.

## Decisions

D29 (turn cost discipline), D22 (redaction), D17.

## Tasks

- [AGENT-04-T01](../tasks/agent-04-t01-failure-evidence.md)
- [AGENT-04-T02](../tasks/agent-04-t02-context-hygiene.md)

## Tests

`tests/e2e/agent-04-failure-evidence.test.ts`, `tests/unit/agent-context-hygiene.test.ts`, `tests/unit/agent-turn-cap.test.ts`.
