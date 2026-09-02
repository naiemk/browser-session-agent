---
id: AGENT-09-T01
title: Cutover by measurement, then delete the old core
story: AGENT-09
epic: agent
status: todo
depends: AGENT-07-T01
---

# AGENT-09-T01 — Cutover by measurement, then delete the old core

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D35 (cutover gate and deletion trigger), D19 (the baseline is the old agent's score), D34 (what stays)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — results log

## Possible

- `scripts/run-suite.ts` — target switch from AGENT-01-T01
- `src/hosts/web/runtime.ts` — where the shell selects an agent core
- The rebuilt list in D34 — everything to be removed

## Do

1. Run the full suite against both cores from the same commit and record both rows in the results log.
2. Flip the default only if the new core matches or beats the baseline on success rate at equal or lower cost per task.
3. In the same change: delete every path on D34's rebuilt list, remove the target switch, and delete tests that only covered the old core.
4. Keep the kept list intact: transport, driver, product shell, `bin/`, `deploy/`.
5. Update `docs/architecture.md` so it describes the new core rather than the old one, and add a Lessons line about what the rewrite cost and bought.
6. If the new core loses on the suite, do not flip. Record the gap, keep the old default, and write down what would close it.

## Tests

- The existing suite, run twice, is the evidence. Both rows must exist in the results log before the flip.
- `npm test` passes with the old core deleted and no skipped tests left behind.
- A grep-style assertion that no source file references a deleted path.

## Done when

The new core is the default, every path on D34's rebuilt list is gone, `npm test` passes with no skips, the results log holds both comparison rows plus the decision, and `docs/architecture.md` describes what actually ships.
