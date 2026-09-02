# Epic: Coding-agent competence in the browser

Status: in progress. The environment layer, the scoreboard, and the outer loop are built
and tested (287 tests pass). Two things are open and both need model credits: a valid
agent baseline, and therefore the cutover (AGENT-09-T01 is blocked, not skipped).

## Outcome

The agent is as effective in a browser as a good coding agent is in a repository, and we can prove it moved.

Pi is a turn engine plus a tool surface; coding-agent competence comes from four environment properties: cheap idempotent reads, a deterministic oracle the agent cannot fake, reversible mistakes, and fast in-context failure. **The browser keeps only the fourth.** This epic manufactures the other three and builds the scoreboard that says whether it worked. Planner, memory, and evaluator are deliberately gated behind measurement (AGENT-08).

Design context is `docs/autonomous-agent.md`. The eventual campaign layer is `docs/v2-campaigns.md` and is out of scope; only its three cheap forward-compatibility locks are in (AGENT-06).

## Risks

- Building mechanisms with no scoreboard. AGENT-01 lands first for this reason; no mechanism task merges before a baseline exists (D19).
- Letting the executor author the criteria that judge it. Criteria are external and immutable (D20).
- Treating read-only as harmless. A probe runs in the user's authenticated browser; the risk is exfiltration into context and traces (D22).
- Classifying reversibility by verb. "Show more" and "Submit" are both clicks; judgment is per action and unknown means committing (D23).
- Mechanism tax. Probe, checks, and a gate each add turns; a change that raises success while tripling cost is a regression (D29).
- Building the graph too early. A graph over an unreliable executor multiplies failures (D28).
- Suite overfitting. Fixtures are easier than the real web; keep a small flagged real-page set and expect the gap.

## Stories

- AGENT-01: A scoreboard before mechanisms
- AGENT-02: Ask the page anything, change nothing
- AGENT-03: An oracle the agent cannot fake
- AGENT-04: Diagnose failures, keep context clean
- AGENT-05: Irreversible actions are gated
- AGENT-06: Built to yield, not to finish
- AGENT-07: Let measurement pick what comes next
- AGENT-08: Gated next layers (blocked by design)

## Tasks

| Task | Story | Status |
| --- | --- | --- |
| [AGENT-00-T01](../tasks/agent-00-t01-core-seam-and-perception.md) | AGENT-00 | done |
| [AGENT-00-T02](../tasks/agent-00-t02-evidence-and-state-store.md) | AGENT-00 | done |
| [AGENT-01-T01](../tasks/agent-01-t01-suite-and-runner.md) | AGENT-01 | done |
| [AGENT-01-T02](../tasks/agent-01-t02-baseline-metrics.md) | AGENT-01 | partial — reference baseline recorded; agent baseline blocked on credits |
| [AGENT-02-T01](../tasks/agent-02-t01-probe-tool.md) | AGENT-02 | done |
| [AGENT-02-T02](../tasks/agent-02-t02-probe-security.md) | AGENT-02 | done |
| [AGENT-03-T01](../tasks/agent-03-t01-external-criteria.md) | AGENT-03 | done |
| [AGENT-03-T02](../tasks/agent-03-t02-step-checks.md) | AGENT-03 | done |
| [AGENT-04-T01](../tasks/agent-04-t01-failure-evidence.md) | AGENT-04 | done |
| [AGENT-04-T02](../tasks/agent-04-t02-context-hygiene.md) | AGENT-04 | done |
| [AGENT-05-T01](../tasks/agent-05-t01-reversibility-judgment.md) | AGENT-05 | done |
| [AGENT-05-T02](../tasks/agent-05-t02-commit-gate.md) | AGENT-05 | done |
| [AGENT-06-T01](../tasks/agent-06-t01-park-and-entity-state.md) | AGENT-06 | done |
| [AGENT-07-T01](../tasks/agent-07-t01-session-strategy-experiment.md) | AGENT-07 | partial — bounded session built and running; the A/B comparison needs credits |
| [AGENT-07-T02](../tasks/agent-07-t02-memory-instrumentation.md) | AGENT-07 | todo |
| [AGENT-09-T01](../tasks/agent-09-t01-cutover-and-delete.md) | AGENT-09 | blocked — see the task for the two open conditions |

Also built beyond the original table, because the todo list called for them: the
independent evaluator (`src/core/evaluator.ts`), the living task graph
(`src/core/plan.ts`), and lazy skills (`src/agent/skills.ts`). These were gated behind
measurement in AGENT-08; they exist and are tested, but the gate that would justify
*relying* on them is still open.

Order: AGENT-01 first and alone. Then AGENT-02, AGENT-03, AGENT-04 in any order. Then a suite rerun: **if perception plus the oracle do not move the numbers, the diagnosis is wrong and nothing downstream is worth building.** Then AGENT-05 and AGENT-06, then AGENT-07 to choose what comes next.

## Definition of done

All 13 tasks done, and:

- The suite runs on one command with a baseline plus a row per merged mechanism in the results log.
- No `committing` action can fire without live criteria and the goal's approval policy.
- A fresh process resumes a partway task from disk without repeating a committed action.
- D27 and the memory half of D28 are no longer `hypothesis`.
- Every open question in `docs/autonomous-agent.md` is either answered with a results-log row or explicitly deferred with an entry condition.

## Spec pointers

- `docs/autonomous-agent.md` — living design doc, open questions, results log, lessons
- `docs/v2-campaigns.md` — the eventual campaign layer, out of scope
- `docs/decisions.md` — D19–D33
- `docs/architecture.md` — what exists today
- `docs/test-design.md` — fixture map to extend
