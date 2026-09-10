# Long-running jobs and campaigns

Status: product/architecture overview. **Normative requirements live in
[`docs/jobs-v2-spec.md`](jobs-v2-spec.md).** Evaluation and cutover gates:
[`docs/jobs-v2-evaluation.md`](jobs-v2-evaluation.md). Work breakdown:
[`work-items/epics/v2-campaigns.md`](../work-items/epics/v2-campaigns.md).

The current `src/jobs` tree is a prototype, not a production long-running product. Do not
treat green prototype tests as proof of multi-week campaigns, cron, CAPTCHA handling,
nondelegable enforcement, or cold-process recovery.

## Product idea

A **job** is an explicitly created durable workflow. A **campaign** is the same engine in
recurring multi-case mode. A simple durable job uses one singleton case. An ordinary
browser conversation never silently becomes or selects a job.

```text
Pi / CLI / hosted UI
        |
        v
JobApplicationService
  - create, revise, approve, pause, answer human work
        |
        +--> SpecCompiler --------> immutable WorkflowSpec
        |
        +--> JobRepository -------> transactional durable state
        |
        +--> SchedulerPolicy -----> pure next-work decision
                                      |
                                      v
                              AttemptDispatcher
                                - lease + fencing
                                - ExecutionHost required
                                      |
                         +------------+-------------+
                         |                          |
                  ContextCompiler            ResourceCoordinator
                         |                    profile/host/account
                         v                          |
                  ExecutionKernel -----------------+
                    direct | Fabric (optional)
                         |
                  persistent BrowserPort
                         |
                  OutcomeEvaluator
                         |
             transactional state/effect/event commit
```

Control adapters never contain scheduling or workflow rules. The scheduler never owns a
model or browser. Missing `ExecutionHost` is `runtime_unavailable`, never `idle`.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Job | Durable user-created objective, active spec, lifecycle, policy |
| Campaign | Product view of a multi-case recurring job (not a second scheduler) |
| Spec version | Immutable approved workflow and policy |
| Case | Independently advancing subject with stable task-defined key |
| Work item | Schedulable operation from an approved template |
| Attempt | Leased, bounded execution of one work item (or homogeneous read-only batch) |
| Effect | Externally observable consequence with its own journal |
| Human request | Durable decision/approval or rehydratable challenge/identity work |
| Run | Telemetry for an attempt — not workflow authority |
| Goal | One-shot chat objective — not a job |

**Sprint is never authoritative.** Context batching is derived from ready work.

## Settled principles (see D57 + normative spec)

- One authority per record type; transactional control store (SQLite target after Node 24
  canary); large evidence remains content-addressed files.
- Specs compile strictly to immutable canonical bytes; no string-to-predicate coercion or
  wildcard grant synthesis at approval.
- Every work item is pinned to a spec hash; revision needs an explicit migration plan.
- Direct kernel ships first on the persistent Magpie browser; Fabric is optional behind
  one `ExecutionKernel` and cannot fork safety or state.
- Challenges, approvals, retries, and cancellation return one typed outcome. Human-only
  work cannot wake by timer.
- Effects use prepared → dispatched → observed / uncertain → reconciled / abandoned.
  A local claim never proves a remote effect happened.
- Top-level completion uses durable typed outputs, provenance, artifacts, and aggregate
  oracles — not the executor claim or current page.
- No dual-write migration. Prototype jobs are validated and imported read-only or
  archived; malformed records are never scheduled.

## Prototype reality (why replacement is required)

The prototype proves useful pieces (explicit creation, versioned specs, bounded `runTask`,
fixture browser, inbox/leases) but does **not** yet:

1. Execute due ticks with a real model/browser (`runtime_unavailable` path is honest only
   after quarantine).
2. Reconnect CLI/Pi runs to Magpie's persistent profile.
3. Keep one transactional authority (overlapping JSON stores; non-atomic transitions).
4. Enforce revision, completion oracles, pacing, challenge breakers, lease renewal/fencing,
   cancel, or due-scan fairness as product claims.

Full requirement IDs and contracts: [`jobs-v2-spec.md`](jobs-v2-spec.md). Challenge and
approval attempt contracts: [`challenge-and-approval-handling.md`](challenge-and-approval-handling.md).
Campaign product semantics: [`v2-campaigns.md`](v2-campaigns.md). QUAL/PERF mapping:
[`live-run-investigation-plan.md`](live-run-investigation-plan.md).

## Implementation order (summary)

1. CAMPAIGN-00-T01 — quarantine prototype claims.
2. CAMPAIGN-01 — domain, strict compiler, SQLite repository, importer.
3. CAMPAIGN-02 — pure scheduler, leases, context/evaluator, persistent host.
4. CAMPAIGN-03 — cases, effects, challenges, human rehydration, quality oracles.
5. CAMPAIGN-04 — adapters, telemetry, fault matrix, cutover and delete `src/jobs`.

Every task follows the mandatory discovery → evidence → senior review → **improvement
pass** protocol in [`jobs-v2-evaluation.md`](jobs-v2-evaluation.md). First safe
implementation tickets: **CAMPAIGN-00-T01** and **CAMPAIGN-01-T01** (parallel).

Release order for hard cutover and job-invoked coach:
[`docs/release-roadmap.md`](release-roadmap.md) (R2, then R3).

## Open evidence-dependent items (not claimed done)

- Cron / calendar scheduling until a real execution host is attached.
- CAPTCHA solving (out of scope); challenge detection/handoff is AGENT-13 + CAMPAIGN-03.
- Nondelegable category enforcement end-to-end (AGENT-14 + effect envelope).
- Cold-process recovery and persistent-profile reattachment (CAMPAIGN-02-T04 / 04-T03).
- Fabric adoption (PERF-03 / AGENT-12-T02) — optional, not a cutover gate.
- QUAL-01, QUAL-05, PERF-04, PERF-05, PERF-09 remain open outside Jobs V2 cutover.
- Strategy coach (D58 / `docs/coach.md`) — post-cutover; planner-owned calibration
  policy; not a cutover gate.
