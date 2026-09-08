# CAMPAIGN-00: Prototype fails loudly

Status: done
Normative: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md) MIGRATE-01, ADAPTER-02  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)

As an operator, I am not told that durable work is scheduled, idle, resumed, or safe when
the prototype lacks the runtime or invariants required to make that claim.

## Acceptance criteria

- Prototype commands and status output are labeled experimental.
- A tick with eligible work but no model/browser returns `runtime_unavailable`, not idle.
- Scheduled execution is not advertised until it can attach to the persistent browser.
- Ephemeral-browser execution requires an explicit development flag and warns that login
  state is not persistent.
- Unsafe spec revision over materialized work is rejected with guidance to create a new
  prototype job.
- No existing prototype record is silently migrated or deleted.

## Tasks

- [CAMPAIGN-00-T01](../tasks/campaign-00-t01-quarantine-prototype.md)

## Done when

CLI/Pi tests prove every unsupported path fails explicitly, no documentation presents the
prototype as an operable scheduler, and ordinary one-shot browser behavior is unchanged.
Evaluation record exists under `work-items/evaluations/jobs-v2/`.
