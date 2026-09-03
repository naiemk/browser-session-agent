---
id: AGENT-05-T02
title: Commit gate and navigation checkpoint
story: AGENT-05
epic: agent
status: todo
depends: AGENT-05-T01, AGENT-03-T01
---

# AGENT-05-T02 — Commit gate and navigation checkpoint

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D23 (gate), D25 (memory may not authorize), D32 (help is queued, not interruptive)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — reversibility

## Possible

- `src/session.ts` — `act()`, takeover and pause paths
- `src/host/memory-host.ts` — `confirm` and `input` surface for approval
- `src/hosts/web/runtime.ts` — `ui_request` cards already render in chat
- `src/store/run-store.ts` — evidence before and after

## Do

1. Before a `committing` action: require the task's stored criteria preconditions to pass, capture evidence (observation plus screenshot) before, execute, capture evidence after.
2. Approval policy per goal: `auto`, `ask`, `never`. Default `ask`. `never` fails the action closed with a clear code.
3. Route `ask` through the existing approval card and takeover paths. Record the decision and who made it.
4. Before a `navigational` action, checkpoint current URL and known field values to the run directory so a retry does not restart from zero.
5. No remembered or predicted knowledge may satisfy the gate; only a live check may (D25).
6. Log every case where the preconditions already passed, so the value of relaxing to `auto` can be measured later.

## Tests

- `tests/e2e/agent-05-commit-gate.test.ts` — on a fixture whose submit works only once, a committing action under `ask` does not fire until approval; under `never` it fails closed; under `auto` it fires and both before and after evidence exist; a committing action with failing preconditions is refused without firing.
- `tests/unit/agent-checkpoint.test.ts` — a navigational action writes a checkpoint containing URL and field values; a retry restores them.

## Done when

No `committing` action can fire without passing live criteria and the goal's approval policy, before-and-after evidence exists for each one, navigation checkpoints restore field values on retry, and the fixture proves a one-shot submit is never fired twice. Both test files in the `npm test` glob.
