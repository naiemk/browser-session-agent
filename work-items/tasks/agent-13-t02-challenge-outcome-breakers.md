---
id: AGENT-13-T02
title: Add typed challenge outcomes and circuit breakers
story: AGENT-13
epic: agent
status: done
depends: AGENT-13-T01
---

# AGENT-13-T02 — Add typed challenge outcomes and circuit breakers

## Discovery

1. Trace all consumers of successful, failed, parked, and cancelled browser results.
2. Identify the host-neutral boundary shared by direct tools, jobs, and Fabric providers.
3. Reconstruct repeated-host and distinct-host challenge chains from the Berlin run.
4. Determine durable breaker keys, expiry, and reset semantics.

## Fix

1. Add `blocked.challenge` to the common operation outcome.
2. Let a high-confidence challenge override a passed URL/postcondition.
3. Add typed work-item, host/account, profile, and session breakers owned by a
   host-neutral `ResourceCoordinator`, not the model.
4. Block subsequent calls before browser execution and return the original evidence.
5. Require changed evidence or explicit resume before one retry.
6. Propagate the same terminal result through Fabric and stop the active batch.
7. Define a persistence port so durable jobs share breaker state across jobs using one
   profile; do not write policy into the prototype per-job scheduler store.

## Evidence

- Fixtures where the requested URL loads a challenge but the result is `blocked`.
- Zero same-host browser calls after a high-confidence block.
- Multi-host fixture trips the session budget without enumerating more origins.
- Cancellation, approval, evidence, and ordinary failure behavior remain unchanged.
- Direct/Fabric parity canary.
- Cross-job canary: one profile/host block suppresses every affected job while independent
  resources remain eligible.

## Discussion

- Tune thresholds from measured false positives and blocked-run cost.
- Decide whether session grouping uses operation class, host family, or a narrower key.
- Define how long a breaker survives across job ticks and browser restarts.
- Align the persistence adapter with CAMPAIGN-02-T01; this task owns the generic breaker
  contract, not the durable-job repository.

## Done when

Typed outcomes reach every runtime consumer, breakers stop all canary retries, evidence is
preserved, and no model or generated program can reset the breaker.
