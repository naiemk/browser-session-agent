# CAMPAIGN-04: Adapters, telemetry, proof, cutover

Status: todo  
Normative: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md) ADAPTER-*, OBS-*, MIGRATE-02..04  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)

As an operator, I use the same durable-job behavior from Pi, CLI, scheduled invocation,
and hosted control surfaces, with evidence that recovery works across real process and
browser boundaries.

## Acceptance criteria

- Pi, CLI, web, and scheduled adapters call one application service and do not contain
  workflow policy.
- Control commands distinguish queued, ineligible, blocked, busy, unavailable, and idle.
- Per-turn model attribution, wall-time decomposition, and cost-per-accepted-case exist;
  cost does not fail CI alone.
- Tests spawn and kill real processes at each effect boundary.
- Persistent-profile tests reconnect after a control-process restart and reject stale
  page refs.
- Controlled live runs measure success, quality, challenge incidence, approval wait,
  action failures, wall time, and model cost.
- Prototype jobs have a dry-run validator and read-only importer/archive path.
- The old `src/jobs` runner, sprint state, and duplicate stores are deleted after all gates
  pass.

## Tasks

- [CAMPAIGN-04-T01](../tasks/campaign-04-t01-product-adapters.md) — ADAPTER-01..04
- [CAMPAIGN-04-T02](../tasks/campaign-04-t02-telemetry-routing.md) — OBS-01..04
- [CAMPAIGN-04-T03](../tasks/campaign-04-t03-fault-process-matrix.md) — MIGRATE-02 proof
- [CAMPAIGN-04-T04](../tasks/campaign-04-t04-cutover-delete-prototype.md) — MIGRATE-02..04
- [CAMPAIGN-R2-1](../tasks/campaign-r2-1-product-execution-host.md) — R2.1 product host (L6)
- [CAMPAIGN-R2-2](../tasks/campaign-r2-2-magpie-web-bind.md) — Magpie/web bind of durable commands (L6)
- [CAMPAIGN-R2-E2](../tasks/campaign-r2-e2-hosted-rpc-host.md) — Hosted/RPC ExecutionHost twin (L6/L2)
- [CAMPAIGN-R2-E4](../tasks/campaign-r2-e4-prototype-dry-run.md) — Prototype import/archive dry-run (STORE-06)

## Done when

All supported adapters pass the same contract suite, two comparable live jobs complete
through the persistent browser, recovery canaries pass, full requirement traceability
exists, and no production command imports the prototype runner.
