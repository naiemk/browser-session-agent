# CAMPAIGN-03-T03: Challenges and shared breakers

Status: done  
Spec: **HUMAN-01** … **HUMAN-03**, **EXEC-07** (challenge family)  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L2**, **L3** cross-job  
Cross-epic: AGENT-13

## Goal

Integrate ChallengeDetector outcomes into durable dispatch; shared ResourceCoordinator
breakers; dedupe challenge HumanRequests.

## Fix

- High-confidence challenge overrides URL success (HUMAN-01 / PERF-12)
- Profile/host/account breakers shared across jobs (HUMAN-02)
- One open challenge request per (job, resource, intent) (HUMAN-03)
- Challenge retry family separate (EXEC-07)

## Tests

- Challenge HTML → blocked without TOOL_PARK injection
- Zero autonomous same-host retries after breaker
- Cross-job shared profile suppression

## Depends on

CAMPAIGN-02-T01; AGENT-13-T01..T02 (minimum).

## Done when

HUMAN-01..03 evidenced; evaluation + improvement pass.

## Supersedes

Challenge portion of obsolete `campaign-03-t02-effects-human-challenges.md`.
