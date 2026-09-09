---
id: AGENT-13-T04
title: Measure profile and pacing effects on challenges
story: AGENT-13
epic: agent
status: todo
depends: AGENT-13-T01, AGENT-13-T02
---

# AGENT-13-T04 — Measure profile and pacing effects on challenges

## Discovery

1. Record browser profile continuity, headed/headless mode, navigation cadence, request
   bursts, host, and challenge outcome without collecting fingerprint secrets.
2. Select repeatable fixtures plus consented live origins that tolerate the experiment.
3. Define equal task, model, network, starting state, and attempt budgets.
4. Separate network reputation from profile and pacing where the environment permits.

## Fix / experiment

1. Compare ephemeral versus existing persistent profiles.
2. Compare current cadence with bounded host pacing and jitter.
3. Keep browser concurrency at one and use the same challenge detector/breakers.
4. Do not add proxy rotation, fingerprint spoofing, stealth patches, or solving services.
5. Run each cell enough times to report raw rates and uncertainty.

## Evidence

- Challenge incidence and time-to-first-challenge by experiment cell.
- Completion, wall time, browser calls, and accepted output.
- Profile contamination and authentication side effects.
- Whether improvements survive a second run day/network.

## Discussion

- Is challenge incidence dominated by IP reputation, browser continuity, or request pace?
- Is a persistent profile acceptable for privacy and reproducibility?
- Which pacing cost is justified by lower block rates?

## Done when

The experiment records reproducible comparisons and chooses adopt, further experiment, or
reject for each mitigation without introducing evasion behavior.
