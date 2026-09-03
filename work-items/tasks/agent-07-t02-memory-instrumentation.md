---
id: AGENT-07-T02
title: Instrumentation that decides whether memory pays
story: AGENT-07
epic: agent
status: todo
depends: AGENT-01-T02
---

# AGENT-07-T02 — Instrumentation that decides whether memory pays

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D28 (memory gated on measured repeat rate), D19 (measure first)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — open questions

## Possible

- `src/domain/observe-diff.ts` — control fingerprints for an archetype signature
- `src/store/run-store.ts` — event log to aggregate from
- the suite CLI (`src/cli`) — where the report is emitted

## Do

1. Compute a cheap **archetype signature** per observation: URL path template plus a fingerprint of the affordance set. No storage yet; this is a metric only.
2. Log per goal: distinct archetypes seen, archetype revisits, and turns spent re-perceiving an archetype already seen in the same goal.
3. Log prediction hit rate: when an action carried an `expect`, how often it held.
4. Report all of it from the suite runner alongside the three headline metrics.
5. Write the finding into the results log and Lessons, then resolve D28's memory half to accepted or rejected. If repeats are rare, say so and stop; that is a legitimate outcome.

## Tests

- `tests/unit/agent-archetype-signature.test.ts` — two fixture pages rendering the same template produce the same signature; a materially different page does not; the signature ignores per-instance ids in the URL path.
- `tests/unit/agent-instrumentation.test.ts` — revisit and re-perception counters aggregate correctly from a synthetic event log.

## Done when

The suite reports distinct archetypes, revisits, re-perception turns, and prediction hit rate; a results-log row records the finding; and the memory half of D28 is no longer `hypothesis`. Both test files in the `npm test` glob.
