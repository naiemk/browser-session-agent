# Epic: V2 Campaign engine

Status: not started — **out of scope.** Recorded so the agent epic does not foreclose it.

## Outcome

A campaign layer manages agent runs across calendar time so a user can hand over a real-world process — reach these companies, apply to suitable jobs — and have it advance for days without babysitting, with their own time asked for in useful chunks.

Full design: `docs/v2-campaigns.md`.

## Why it is not the agent epic

The unit of work is an **entity with state** advancing over days, not a step in a dependency graph. Most entities are blocked on other people most of the time. Waiting is on humans rather than machines, so latency is unbounded and retrying carries a social cost; the world changes while you wait; and deliberate slowness is correct because volume is a liability. None of that is true of a coding agent, and none of it can be built usefully on an executor that cannot yet finish one bounded task reliably.

## Risks

- Building the scheduler before single tasks are reliable. Composition multiplies unreliability.
- Batching human help increases staleness for perishable blocks. There is an optimum, and it argues for converting blocks into durable decisions and clustering perishable work into one window.
- Freezing live modals for hours. Park the intent and re-drive to the block when the human arrives.
- Optimizing sends instead of replies. Under a throughput metric the product degenerates into spam; the metric must be response rate with a floor that pauses the campaign.
- Fan-out beyond the browser. Many runs share one profile, one identity, one rate limit, and one screen for takeover.
- Assuming our records match reality. The user may have acted manually; reconcile on wake.
- Platform policy measures automation, not merit. Quality does not settle this; approval at the commit point and human-like pacing are the mitigations.

## Stories

Not written. The doc's sections map to the eventual shape: entity and stage model, park and wake, reconciliation, the three budgets (model cost, site pace, human attention), batched human queue by interaction kind, approach-level replanning, and quality gating on personalization evidence.

## Tasks

None. The only campaign work currently in scope is [AGENT-06-T01](../tasks/agent-06-t01-park-and-entity-state.md), which locks in the three cheap prerequisites: `parked` as a normal outcome, entity-oriented state with idempotency keys, and cold resume.

## Entry condition

The agent epic's definition of done is met, and the suite shows single tasks passing reliably enough that composing hundreds of them is worth attempting.

## Spec pointers

- `docs/v2-campaigns.md` — target design and open questions
- `docs/decisions.md` — D31 (build to yield), D32 (help is queued and batched), D33 (quality is the objective)
- `docs/autonomous-agent.md` — the layer beneath this one
