# AGENT-16: Strategy coach

Status: in_progress — T01/T02/T03/T05 landed; T04 is R3

As an operator, a harvest over fuzzy browser data gets a cheap scout, then a strategy
guideline, then a repeated loop — instead of an expensive planner guessing tactics, or
an executor wandering until the budget dies.

## Acceptance criteria

- Trajectory since the last coaching checkpoint compresses to a bounded digest: actions,
  yield, cycles, cost. No snapshots or transcripts.
- Executors record yield events (accept / reject / duplicate / lost place), not only
  tool `ok`.
- Coach output is a capped strategy artifact. It cannot rewrite criteria, sources, or
  effects. It does not authorize commits.
- `/plan` tells the planner: if the acquisition loop is unknown, author scout → coach →
  harvest. It does not invent a list of site tactics to burn first.
- `/plan` Execute invokes the same `/coach` handler after pre-coach steps complete.
  The executor remaining-steps list does not include the coach-role todo.
- `/coach` runs review-phase, mutations off, persists a checkpoint, injects only the
  rendered artifact. Manual `/coach` still works mid-harvest.
- Jobs with `coaching.mode = calibration` materialize scout, coach, harvest with harvest
  blocked on the artifact. Rescue yield-breakers do not fire on wall-clock alone.
- Harvest context after coaching is spec + facts + artifact + current page (D52 / EXEC-04).

## Spec

- [`docs/coach.md`](../../docs/coach.md) — idea + COACH-* requirements
- D58 in [`docs/decisions.md`](../../docs/decisions.md)

## Tasks

- [AGENT-16-T01](../tasks/agent-16-t01-trajectory-digest.md) — digest + yield
- [AGENT-16-T02](../tasks/agent-16-t02-strategy-artifact.md) — schema / validate / render
- [AGENT-16-T03](../tasks/agent-16-t03-interactive-coach.md) — `/coach` + plan-mode policy
- [AGENT-16-T05](../tasks/agent-16-t05-plan-execute-coach.md) — Magpie Execute invokes `/coach`
- [AGENT-16-T04](../tasks/agent-16-t04-job-coaching-policy.md) — spec + scheduler + context

## Done when

All five tickets done, cited COACH-* IDs have tests, FakePi `/coach` works, Magpie
Execute auto-runs review after scout, a calibration job materializes the three-step
graph, and no harvest prompt contains a scout transcript.
