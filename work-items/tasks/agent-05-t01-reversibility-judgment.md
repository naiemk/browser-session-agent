---
id: AGENT-05-T01
title: Per-action reversibility judgment
story: AGENT-05
epic: agent
status: todo
---

# AGENT-05-T01 — Per-action reversibility judgment

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D23: judged per action, unknown means committing
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — the property git provides for free

## Possible

- `src/domain/types.ts` — `Control`, `BROWSER_TOOL_NAMES`
- `src/worker/observe.ts` — role and accessible name already collected
- `src/session.ts` — `act()`, the single choke point for every action

## Do

1. Define four classes: `probe`, `reversible`, `navigational`, `committing`.
2. Classify **per action**, from the affordance rather than the verb: accessible name, control role, enclosing form, whether the target submits, and destination for navigations. Clicking "Show more" and clicking "Submit" must land in different classes.
3. Unknown or ambiguous resolves to `committing`. Over-asking is recoverable; an accidental submit is not.
4. Record the class and the reason on every action event so classification can be audited from the ledger.
5. No static tool-to-class map. A test must prove the same tool yields different classes for different targets.

## Tests

- `tests/unit/agent-reversibility.test.ts` — table-driven: submit-like names, destructive names (delete, remove, revoke), send and publish and pay, versus benign expanders and filters; a control with no name and no form context resolves to `committing`; the same `click` verb yields `reversible` and `committing` for two different targets.
- Every classification carries a non-empty reason string.

## Done when

Reversibility is computed per action with an audit reason on the event, unknown resolves to `committing`, and a test proves the same verb classifies differently by target. Test file in the `npm test` glob.
