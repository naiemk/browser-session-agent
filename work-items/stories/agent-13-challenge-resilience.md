# AGENT-13: Challenges stop safely and resume cleanly

Status: todo

As an operator, I get one clear handoff when a site blocks automation, while the agent
stops wasting actions and can resume the exact intent after the block is resolved.

## Acceptance criteria

- Every browser observation is classified by a generic, evidence-based challenge detector.
- A high-confidence challenge returns `blocked.challenge` even when the URL postcondition
  passed.
- Host and session circuit breakers prevent autonomous retries after a terminal block.
- Interactive work offers takeover; deferred work parks one durable challenge item.
- Resume begins with a fresh observation and re-drives only the parked intent once.
- No CAPTCHA solver, anti-bot evasion, fingerprint spoofing, or proxy rotation is added.
- Direct and experimental Fabric execution use the same outcome and breaker state.
- Challenge precision, recall, retries, wall time, turns, and recovery are measurable.

## Spec

- [Challenge and approval handling](../../docs/challenge-and-approval-handling.md)
- [Live-run investigation PERF-12](../../docs/live-run-investigation-plan.md)
- D10, D17, D22, D23, and D29 in `docs/decisions.md`

## Tasks

- [AGENT-13-T01](../tasks/agent-13-t01-challenge-detection-telemetry.md)
- [AGENT-13-T02](../tasks/agent-13-t02-challenge-outcome-breakers.md)
- [AGENT-13-T03](../tasks/agent-13-t03-challenge-handoff-resume.md)
- [AGENT-13-T04](../tasks/agent-13-t04-challenge-mitigation-experiment.md)

## Done when

The fixture corpus meets the detector threshold, circuit-breaker canaries prove no action
continues after a block, takeover and parked-job resumes preserve intent without duplicate
effects, and one controlled live comparison records challenge incidence and recovery.
