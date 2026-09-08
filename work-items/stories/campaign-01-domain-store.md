# CAMPAIGN-01: Domain, compiler, store

Status: todo  
Normative: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md) DOM-*, SPEC-*, STORE-*  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)

As an operator, I can trust that a job, its cases, work, approvals, and progress have one
authoritative state that survives crashes without contradictory files.

## Acceptance criteria

- `Job`, `SpecVersion`, `Case`, `WorkItem`, `Attempt`, `Effect`, and `HumanRequest` have
  explicit owners and state machines.
- Campaign is a multi-case job mode; one-shot goals and attempt runs are not job state.
- Approved specs compile strictly, are immutable, and carry typed completion and stop
  policies.
- One transaction updates all records for a scheduler transition.
- Stable case, work-item, and effect identities have uniqueness constraints.
- Prototype data is validated and imported read-only or archived; malformed data is never
  scheduled.
- Stored sprints and duplicate task/entity status authorities are absent from the new
  model.

## Tasks

- [CAMPAIGN-01-T01](../tasks/campaign-01-t01-domain-types-reducers.md) — DOM-01..07
- [CAMPAIGN-01-T02](../tasks/campaign-01-t02-strict-spec-compiler.md) — SPEC-01..07
- [CAMPAIGN-01-T03](../tasks/campaign-01-t03-sqlite-repository.md) — STORE-01..05,07
- [CAMPAIGN-01-T04](../tasks/campaign-01-t04-prototype-importer.md) — STORE-06

## Done when

Each task has a closed evaluation record; repository contract passes transition, migration,
uniqueness, concurrency, and crash-injection tests; an approved spec reconstructs and
rehashes exactly from durable bytes.
