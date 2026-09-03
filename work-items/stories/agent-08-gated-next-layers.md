# AGENT-08: Gated next layers

Status: blocked — no tasks until the entry conditions below are met

Three layers we expect to want and deliberately have not planned tasks for, because building them over an unreliable executor multiplies failures instead of composing successes.

## Independent evaluator

Re-derive a task's outcome from the evidence ledger plus a fresh observation rather than trusting a claimed result, deterministic first and a cheap model call only for genuinely semantic criteria.

**Entry condition:** AGENT-03 shipped and suite success high enough that a second opinion changes decisions. Before that it mostly re-reports failures the criteria already caught.

## Planner and living task graph

`Plan`, `Task`, `Criterion`, `Fact`, `Evaluation` persisted per goal, mutable at runtime so discovered work appends tasks, replanning only on strategic failure. Includes a planner-emitted stage outline in the task card, and requirements gathered before acting rather than mid-flow (D26).

**Entry condition:** single tasks pass the suite reliably. A graph over an unreliable executor is a failure multiplier.

## Transition memory

Session tier first, then per-account, then a small curated repo-file seed at lowest confidence. Entries store expected outcomes as distributions with frequencies; confidence decays by prediction error, not by clock; entries propose and never authorize.

**Entry condition:** AGENT-07-T02 shows archetypes actually repeat and re-perception is a real cost. If not, stop at the within-run fixes — that is a legitimate result.

## Decisions

D26 (outline before a schema store), D28 (both gated), D25 (memory may not authorize).

## Tasks

None yet, by design. Write them when an entry condition is met, and record in the results log what met it.
