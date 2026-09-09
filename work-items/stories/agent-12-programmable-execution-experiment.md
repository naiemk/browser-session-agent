# AGENT-12: Test programmable execution without replacing the browser boundary

Status: todo — R&D only; production adoption is undecided.

The model should not have to interpret every operation in a regular browser loop. We will
upgrade the supported runtime independently, then test whether Pi Fabric can execute a
bounded batch through the existing Magpie guard and evidence boundary with fewer model
turns, less context, lower cost, and lower latency.

## Acceptance criteria

- Node 24 and the selected Pi release land independently and pass every supported runtime,
  installer, package, and capability-composition check.
- The Fabric experiment runs on an isolated branch from the upgraded baseline.
- Ordinary `magpie` does not load Fabric and preserves its current behavior.
- `magpie --experimental-fabric` plus `/browser-execution fabric` is the only route into
  the experiment.
- Generated code runs in QuickJS and has no direct browser or operating-system access.
- Every nested browser action uses the existing Magpie guard, postcondition, policy,
  evidence, redaction, ownership, and serialization.
- Direct and Fabric execution are compared on deterministic fixtures and at least two
  controlled live runs.
- Performance is normalized by useful accepted output; quality is scored independently.
- Evidence selects adoption, concept-only adoption, more research, or rejection.
- Completing the experiment does not merge it or silently amend D18.

## Decisions

D2, D17, D18, D20–D23, D29, D31, D44, D56. D18 may be amended only by a later
production-adoption decision.

## Tasks

- [AGENT-12-T01](../tasks/agent-12-t01-node24-pi-upgrade.md) — upgrade Node and Pi
  independently.
- [AGENT-12-T02](../tasks/agent-12-t02-fabric-execution-rd.md) — build and measure the
  isolated Fabric path.

## Design

[docs/fabric-execution-experiment.md](../../docs/fabric-execution-experiment.md)

## Done when

The dependency baseline is clean, the experiment has reproducible safety, quality, cost,
context, and latency evidence, and the resulting architectural decision is recorded
without treating implementation effort as evidence of value.
