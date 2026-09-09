# AGENT-14: Approval follows effects, not widgets

Status: todo

As an operator, I authorize the consequential boundary once and do not wait on harmless
mechanical steps, while the final external effect remains protected.

## Acceptance criteria

- Prompt-created/resolved/action-finished timestamps make approval wait explicit.
- Authorization is based on expected effect; `submits-form` and generic words such as
  “apply” cannot alone create an outbound classification.
- Explicit user intent becomes a bounded, auditable effect envelope.
- Remembered approval includes effect, destination/form action, workflow stage, goal/spec,
  limits, and expiry.
- Reused generic control names cannot authorize a later stage.
- Final purchase, payment, send, publish, delete, and access-grant canaries remain gated.
- Ask precision and recall are measured before default behavior changes.

## Spec

- [Challenge and approval handling](../../docs/challenge-and-approval-handling.md)
- [Live-run investigation PERF-11](../../docs/live-run-investigation-plan.md)
- D17, D23, D25, and D29 in `docs/decisions.md`

## Tasks

- [AGENT-14-T01](../tasks/agent-14-t01-approval-precision.md)
- [AGENT-14-T02](../tasks/agent-14-t02-effect-envelope.md)

## Done when

The approval fixture set reaches at least 90% ask precision with no missed consequential
effect, the checkout comparison removes false prompts, and sticky approval cannot cross a
workflow stage.
