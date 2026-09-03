# Autonomous browser agent — living design doc

Goal: an agent as effective in a browser as a good coding agent is in a repository.

This document is **living**. It records current state, what is still open, and what we have learned by measuring. Conclusions live in `docs/decisions.md` (D19+) so there is one decision ledger, not two. This doc holds the context those decisions came from, the questions they have not settled, and the results log.

Superseded by nothing. Supersedes the original hand-written spec, which is gone; its useful content became D19–D30 and the sections below.

## How to keep this doc alive

Four rules. If they are not followed, this becomes another stale spec.

1. **A decision changes status only with evidence.** Move a `hypothesis` to `accepted` or `rejected` in `docs/decisions.md` and add one line to the results log below saying what settled it.
2. **Never delete a decision.** Mark it superseded and point forward. The dead ends are the expensive knowledge.
3. **Every suite run appends a row** to the results log: date, commit, success rate, steps per task, cost per task, and what changed. A run that made things worse is the most valuable row in the table.
4. **New surprises go in Lessons.** If we were wrong about something structural, write it down in one sentence rather than quietly correcting course.

## The diagnosis this all rests on

Read from the installed Pi packages, not from documentation:

- The loop is code: `runLoop` in `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js`. No step cap exists.
- Context hygiene is code: per-tool truncation at 2000 lines / 50KB (`dist/core/tools/truncate.js`) plus compaction through a separate summarizer call (`dist/core/compaction/compaction.js`).
- Tool failures are code: throws are caught and returned to the model as text; the loop continues. No automatic tool retry.
- Root cause, hypothesis testing, cleanup, and validation are **not** in Pi. Its docs say to use git for rollback; validation is the model running `npm test` through `bash` and reading the exit code.
- There is no planner, todo, or task graph in core. Those are example extensions.

So Pi is a turn engine plus a tool surface, and coding-agent competence comes from four environment properties:

1. Reads are cheap, idempotent, repeatable.
2. A deterministic oracle exists that the agent cannot fake.
3. Mistakes are reversible.
4. Failure returns as text inside the loop in seconds.

**The browser keeps only the fourth.** Reads can require navigation, which mutates. Success is observational, not executable. Submit, send, pay, and delete are permanent. That asymmetry is the work. We do not rebuild the loop.

### Where the coding analogy holds and breaks

Holds: repository is to website as files are to pages, as `grep` is to task-scoped inspection, as following imports is to following navigation, as compiler feedback is to validation and console and network signals, as coding skills are to flow knowledge.

Breaks, and these three gaps are the whole design: there is no `git` (D23), no `npm test` (D20), and structure is not present for free but must be learned and revalidated (D25).

Eventual target: a campaign layer managing agent runs over calendar time (`docs/v2-campaigns.md`, D31–D33). Not being built now. It constrains this layer in three ways only: `parked` must be a normal task outcome, durable state must be entity-oriented with idempotency keys, and tasks must resume cold.

Work breakdown: `work-items/epics/agent.md` (8 stories, 13 tasks). Each task carries a definition of done that can be checked objectively, usually a named test file plus a specific assertion.

## Current state

New core and runtime (D34, D36), built and tested against fixtures, not yet wired to the hosted shell. Layering is described in `docs/runtime.md`.

- `src/core/` — perception (semantic snapshot with stable refs), one action choke point that always evaluates a postcondition, read-only probe, code-only predicate engine, reversibility judgement, commit gate, append-only ledger, entity state with idempotency keys, task graph, evaluator. Imports only node builtins and Playwright, enforced by test.
- `src/runtime/` — one bounded task on `pi-agent-core`'s loop with an injectable model port, plus the task card, tools, context pruning, and turn budget.
- `src/suite/` — 26 tasks with external criteria and three targets: `reference` (no model), `mock` (real loop, no tokens), `live` (paid).
- `src/cli/` — the front door: `run`, `suite`, `replay`. No socket, no pairing (D40).
- Tests never call a provider (D37). CI runs the mock target on every push and asserts no key is present; the live baseline is a manual workflow (D38).

Old system, still the shipping product (see `docs/architecture.md`):

- Hosted Pi session with the coding identity replaced, browser-only tools, `noTools: "builtin"`, no Pi skills or context files.
- Semantic inspect with ref-tagged controls, action harness with read-back and delta postconditions (D17), page-plan DSL, evidence log on disk, knowledge store with candidate/approved states.
- Desktop node runs Chromium; the VPS never does (D11).

Designed, not built: everything in the plan — task suite, read-only probe, external criteria, richer failure evidence, context pruning, turn cap, commit gate.

Deliberately not decided yet: session strategy (D27), planner and graph, memory tiers (D28).

## Open questions and how each gets settled

- **Does the environment diagnosis hold?** Not yet answered, and it is the one that matters most. The mechanisms are built and tested, but comparing agent success with and without them needs a live run, which needs model credits. Until then the diagnosis remains a hypothesis with good arguments behind it, not a measured result. Note what the mock target does and does not settle: it proves the plumbing works end to end, and says nothing about competence.
- **Can the new core replace the old one?** Blocked on the same baseline plus a `BrowserPort` adapter over the kept CDP worker (`work-items/tasks/agent-09-t01-cutover-and-delete.md`). The old core is still the shipping default, on purpose.
- **Long compacted session or fresh session per task?** (D27) Run the suite both ways; compare success, steps, and cost.
- **Is a planner the binding constraint, or is single-task reliability?** (D28) Do not build the graph until single tasks pass reliably; a graph over an unreliable executor multiplies failures.
- **Do page archetypes repeat enough for cross-session memory to pay?** (D28) Instrument archetype revisits, turns spent re-perceiving a known surface, and prediction hit rate. If repeats are rare, stop at the within-run fixes; that is a legitimate outcome, not a failure.
- **What is the right scout budget?** (D24) A knob defaulted low; measure whether scouting reduced steps and failed commits on later tasks of the same archetype.
- **How often was the approval gate unnecessary?** (D23) Log cases where a committing action's preconditions already passed, to judge whether auto-commit is ever safe per goal.

## Results log

Every suite run. Append, never rewrite.

| Date | Commit | Change | Success rate | Steps/task | Cost/task | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-02 | a481a0e | suite validity: 26 tasks, reference target | 100% (26/26) | 2.69 | n/a | AGENT-01. Reference solutions pass every task, so the criteria are reachable and we are not measuring agents against impossible work. No model involved, hence no cost. Raw: `results/baseline-reference.json`. |
| 2026-09-02 | (this branch) | agent baseline attempt | **invalid** | — | ~$0.003 observed | Blocked on model credits: the OpenRouter key is exhausted, so 26/26 sessions failed with HTTP 402 before acting. The runner marks the run invalid and refuses to quote it. Raw: `results/agent-attempt-invalid.json`. Reproduce with credits: `npm run suite:live` (see docs/runtime.md). Individually, before credits ran out, `apply-submit`, `noisy-page-save`, `fill-profile`, `dynamic-reveal`, and `combobox-unavailable` all passed, so the wiring works. |

## Lessons

Written down so they are not relearned.

- **We designed mechanisms before we could measure them.** The first version of this plan had six phases and no scoreboard; fixture tests measured the harness, not agent competence. Hence D19.
- **We nearly let the agent grade its own homework.** Self-authored success checks look like validation but are not; coding validation works because the oracle is external. Hence D20.
- **We assumed read-only meant safe.** On an authenticated page the risk is exfiltration into context and traces, not mutation. Hence D22.
- **We modelled reversibility as a property of tools.** It is a property of situations. Hence D23.
- **We over-engineered flow knowledge within minutes of a good example.** Signatures, retrieval, and a promotion pipeline for knowledge the model already had. Hence D26.
- **A blanket prohibition hid three different activities.** "Never crawl" bundled ahead-of-need mapping, pre-commit scouting, and enumeration, which have different economics. Hence D24.
- **A provider failure is indistinguishable from an agent doing nothing, unless you look.** The first agent run reported 15.4% success. Every one of those failures was HTTP 402: the credits were gone. Pi surfaces model failures as error assistant messages rather than thrown exceptions, so the driver saw a session that completed with no report and scored it as incompetence. Two fixes: the session now captures model errors, and provider failures are excluded from the success rate with the whole run marked invalid past a quarter lost. A scoreboard that silently blames the agent for the bill is worse than no scoreboard.
- **Suite tasks can be passed by doing nothing.** Three "abandon" tasks had criteria satisfied on page load, so an agent that never acted scored them. Abandon tasks now need a criterion that proves engagement — an option list that only renders once opened, a field that must be filled before the refusal counts — and the one that could not be made observable was deleted rather than kept as noise.
- **Running many model sessions back to back trips rate limits.** The suite paces itself between tasks for that reason. Measuring the provider's throttle instead of the agent is an easy and invisible mistake.
- **A test that costs money gets run less, which is the opposite of what tests are for.** The first build could only exercise the agent loop by paying for it, so the loop was effectively untested whenever credits were short. Mocking at the model port fixed that: the same code path now runs free and deterministically. The lesson generalises — put the seam at the boundary you want to fake, and the expensive dependency stops dictating how often you can check your work.
- **Aborting a loop you do not own may not stop it.** The turn cap called `abort()` from a `turn_end` listener and the run continued to 51 turns, because the signal only reaches a provider that chooses to honour it. Enforcing the budget at the port instead made it deterministic. Anything that "stops" a third-party loop deserves a test that proves it stopped.

## External evidence we are relying on

- **For learning reusable routines:** Agent Workflow Memory (arXiv 2409.07429, PMLR v267) improved WebArena by 51.1 percent relative and Mind2Web by 24.6 percent while reducing steps, beat human-written workflows by 7.9 percent, and generalized best in its online mode, which induces from real tasks rather than a crawl. Supports D24 and D28.
- **Against caching coordinates:** the production consensus on cached selectors is that they convert explicit breakage into silent degradation, and the dangerous entry is the one that still resolves while pointing at a different control; the mitigation is fingerprint revalidation on every use. Supports D25.
- Both are benchmark or industry evidence, not evidence from our own product. They inform priors; the results log decides.
