# CAMPAIGN-03: Cases, effects, humans, quality

Status: todo  
Normative: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md) CASE-*, EFFECT-*, HUMAN-*, QUALITY-*  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)

As an operator, a campaign advances independent cases safely, batches durable questions,
and gives me one fresh headed handoff for perishable challenges without repeating effects.

## Acceptance criteria

- Discovery upserts stable case keys and materializes an approved per-case workflow once.
- Case-local blocks do not stop unrelated cases; profile/host blocks stop all work sharing
  that resource.
- Job completion is evaluated from durable case/artifact evidence, not the current page.
- Revision approval includes an explicit retain/map/cancel/archive migration plan.
- Effects move through prepared, dispatched, observed, uncertain, reconciled, or abandoned
  states.
- Scheduled attempts persist approval requests instead of waiting inside model tool calls.
- Perishable challenge/identity requests store intent, rehydrate one at a time, require a
  fresh observation, and cannot wake from a timer while unresolved.
- Direct and Fabric kernels use the same work, effect, challenge, and human contracts.
- Typed result/artifact manifests and aggregate oracles close top-level quality claims.

## Tasks

- [CAMPAIGN-03-T01](../tasks/campaign-03-t01-cases-materialization-revision.md) — CASE-01..05
- [CAMPAIGN-03-T02](../tasks/campaign-03-t02-effects-approvals.md) — EFFECT-01..06
- [CAMPAIGN-03-T03](../tasks/campaign-03-t03-challenges-breakers.md) — HUMAN-01..03
- [CAMPAIGN-03-T04](../tasks/campaign-03-t04-human-rehydration.md) — HUMAN-04..06
- [CAMPAIGN-03-T05](../tasks/campaign-03-t05-quality-oracles-artifacts.md) — QUALITY-01..04

## Done when

Each task has a closed evaluation record; duplicate discovery, revision, aggregate
completion, uncertain-effect, cross-job challenge, batched decision, and headed
rehydration fixtures all pass without domain-specific code.
