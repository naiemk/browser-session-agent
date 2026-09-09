---
id: AGENT-13-T01
title: Detect and measure browser challenges
story: AGENT-13
epic: agent
status: done
---

# AGENT-13-T01 — Detect and measure browser challenges

## Discovery

1. Collect redacted saved observations for challenge, 403, rate-limit, login, outage,
   empty, and ordinary interstitial pages.
2. Label them `challenge`, `not_challenge`, or `ambiguous` with the supporting signals.
3. Inventory URL, title, text, controls, status, failed-request, and resource signals
   available from every browser port.
4. Trace where post-action, resume, and Fabric observations can run one pure classifier.
5. Establish current retries, turns, and wall time after first challenge on
   `goal_mtt17kx6001`.

## Fix

1. Add a pure `ChallengeDetector` returning confidence and generic signal codes.
2. Run it on every observation without changing action outcomes in this task.
3. Emit challenge-candidate telemetry with host, session, operation, evidence IDs, and
   detector version.
4. Add prompt-safe summaries; do not expose raw private page content.
5. Keep vendor names out of branching logic.

## Evidence

- Reviewed corpus and confusion matrix.
- At least 98% precision and 95% recall before behavior is enabled.
- Exact join from each metric to a ledger observation.
- No changes to actions, prompts, approvals, or completion in instrumentation mode.

## Discussion

- Which signals are portable across browser ports?
- Is HTTP status available reliably enough to use as supporting evidence?
- Which ambiguous states should remain normal failures rather than challenges?

## Done when

The detector and telemetry are tested on fixtures and saved live evidence, meet the stated
thresholds, and ship disabled from behavioral decisions.
