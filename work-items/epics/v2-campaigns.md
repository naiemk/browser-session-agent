# Epic: Durable jobs and campaigns (Jobs V2)

Status: **V2 engine implemented (soft cutover); L7 prototype deletion pending.**
Normative spec: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md)
Evaluation protocol: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)
Product overview: [`docs/long-running-jobs.md`](../../docs/long-running-jobs.md)

The current `src/jobs` tree is a prototype to quarantine and replace, not a compatibility
contract. Implementers MUST cite requirement IDs from the normative spec and complete the
evaluation protocol (discovery → implement → evidence → senior review → scorecard →
**mandatory improvement pass** → final evidence) for every task.

## Outcome

An explicitly created job advances safely over calendar time through bounded attempts on
Magpie's persistent browser. A campaign is the same engine on many independent cases.
Durable state is transactional; effects are reconciled honestly; challenges and approvals
yield without blocking unrelated work; a new process continues without session history.

## Stories

- [CAMPAIGN-00: Prototype fails loudly](../stories/campaign-00-prototype-quarantine.md)
- [CAMPAIGN-01: Domain, compiler, store](../stories/campaign-01-domain-store.md)
- [CAMPAIGN-02: Scheduling and persistent execution](../stories/campaign-02-scheduling-execution.md)
- [CAMPAIGN-03: Cases, effects, humans, quality](../stories/campaign-03-cases-effects-human.md)
- [CAMPAIGN-04: Adapters, telemetry, proof, cutover](../stories/campaign-04-production-cutover.md)

## Tasks (implementation order)

| Task | Spec IDs | Deps | Status |
| --- | --- | --- | --- |
| [CAMPAIGN-00-T01](../tasks/campaign-00-t01-quarantine-prototype.md) | MIGRATE-01, ADAPTER-02 | none | done |
| [CAMPAIGN-01-T01](../tasks/campaign-01-t01-domain-types-reducers.md) | DOM-01..07 | none (parallel with 00) | done |
| [CAMPAIGN-01-T02](../tasks/campaign-01-t02-strict-spec-compiler.md) | SPEC-01..07 | 01-T01 | done |
| [CAMPAIGN-01-T03](../tasks/campaign-01-t03-sqlite-repository.md) | STORE-01..05,07 | 01-T01, AGENT-12-T01 canary | done |
| [CAMPAIGN-01-T04](../tasks/campaign-01-t04-prototype-importer.md) | STORE-06 | 01-T03 | done |
| [CAMPAIGN-02-T01](../tasks/campaign-02-t01-scheduler-policy.md) | SCHED-01..08 | 01-T01 | done |
| [CAMPAIGN-02-T02](../tasks/campaign-02-t02-leases-fencing.md) | EXEC-01..03,08 | 01-T03 | done |
| [CAMPAIGN-02-T03](../tasks/campaign-02-t03-context-outcome-evaluator.md) | EXEC-04,06,07,09 | 01-T02, 02-T01 | done |
| [CAMPAIGN-02-T04](../tasks/campaign-02-t04-persistent-execution-host.md) | EXEC-01,05 | 02-T02, 02-T03 | done |
| [CAMPAIGN-03-T01](../tasks/campaign-03-t01-cases-materialization-revision.md) | CASE-01..05, DOM-05, SPEC-05 | 01-T03, 01-T02 | done |
| [CAMPAIGN-03-T02](../tasks/campaign-03-t02-effects-approvals.md) | EFFECT-01..06, SPEC-06 | 03-T01, AGENT-14 | done |
| [CAMPAIGN-03-T03](../tasks/campaign-03-t03-challenges-breakers.md) | HUMAN-01..03, EXEC-07 | 02-T01, AGENT-13 | done |
| [CAMPAIGN-03-T04](../tasks/campaign-03-t04-human-rehydration.md) | HUMAN-04..06, EFFECT-04, SCHED-06 | 03-T02, 03-T03, 02-T04 | done |
| [CAMPAIGN-03-T05](../tasks/campaign-03-t05-quality-oracles-artifacts.md) | QUALITY-01..04, EXEC-09, SPEC-03 | 03-T01 | done |
| [CAMPAIGN-04-T01](../tasks/campaign-04-t01-product-adapters.md) | ADAPTER-01..04, DOM-06..07, SCHED-02,08 | 02-T04, 03-T04 | done |
| [CAMPAIGN-04-T02](../tasks/campaign-04-t02-telemetry-routing.md) | OBS-01..04 | 02-T03 | done |
| [CAMPAIGN-04-T03](../tasks/campaign-04-t03-fault-process-matrix.md) | MIGRATE-02 (proof) | 02-T04, 03-T02, 03-T03 | done |
| [CAMPAIGN-04-T04](../tasks/campaign-04-t04-cutover-delete-prototype.md) | MIGRATE-02..04 | all above + 04-T01..T03 | done |

### Superseded broad tasks (kept for history)

These earlier broad tickets are **superseded** by the split above. Do not implement them
as written:

- `campaign-01-t01-domain-spec-compiler.md` → split into 01-T01 + 01-T02
- `campaign-01-t02-transactional-repository.md` → 01-T03 (+ importer 01-T04)
- `campaign-02-t01-scheduler-resources.md` → 02-T01
- `campaign-02-t02-execution-host.md` → 02-T02 + 02-T03 + 02-T04
- `campaign-03-t01-case-workflows-oracles.md` → 03-T01 + 03-T05
- `campaign-03-t02-effects-human-challenges.md` → 03-T02 + 03-T03 + 03-T04
- `campaign-04-t01-product-adapters.md` → keep id for adapters; telemetry moved to 04-T02
- `campaign-04-t02-proof-and-cutover.md` → 04-T03 + 04-T04

## Cross-epic dependencies

- AGENT-12-T01 (Node 24 / Pi) before final STORE SQLite decision
- AGENT-12-T02 (Fabric) optional; not on cutover path (OBS-06)
- AGENT-13 / AGENT-14 / AGENT-15 supply attempt-level challenge, approval, recovery
  contracts consumed by CAMPAIGN-03
- QUAL-01, QUAL-05, PERF-04, PERF-05, PERF-09 remain open outside cutover (OBS-05)

## Definition of done

See MIGRATE-02 and [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md) §3.
Additionally: every requirement in `jobs-v2-spec.md` §12 has a closed ticket evaluation
record under `work-items/evaluations/jobs-v2/`.

## Spec pointers

- `docs/jobs-v2-spec.md` — normative requirements
- `docs/jobs-v2-evaluation.md` — evidence levels and review protocol
- `docs/long-running-jobs.md` — product overview
- `docs/v2-campaigns.md` — campaign semantics
- `docs/challenge-and-approval-handling.md` — challenge/approval design
- `docs/fabric-execution-experiment.md` — optional kernel
- `docs/decisions.md` — D31–D33, D56, D57, D58
- `docs/coach.md` — post-cutover strategy coach (AGENT-16)
- `docs/release-roadmap.md` — R2 hard cutover, R3 job-invoked coach
- `docs/live-run-investigation-plan.md` — QUAL/PERF backlog mapping
