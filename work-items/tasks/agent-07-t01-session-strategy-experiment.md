---
id: AGENT-07-T01
title: Session strategy experiment
story: AGENT-07
epic: agent
status: todo
depends: AGENT-01-T02, AGENT-04-T02
---

# AGENT-07-T01 — Session strategy experiment

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D27 (hypothesis, and how it is settled), D19 (three metrics)
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — open questions

## Possible

- `src/hosts/web/runtime.ts` — the single long-lived session today
- Pi `SessionManager.inMemory()`, `createAgentSession({ noTools: "all", tools, customTools })`
- Pi `DefaultResourceLoader({ systemPromptOverride })` for a task card
- A terminating custom tool (`terminate: true`) for a structured task result

## Do

1. Implement strategy B: a fresh bounded session per task, with the task card as system prompt, browser tools plus a `task_result` terminating tool, disposed after each task.
2. Keep strategy A: one session per goal, relying on Pi compaction plus the AGENT-04-T02 pruning.
3. Make the strategy a single switch so the suite can run both without other differences.
4. Run the full suite under both. Report success rate, steps per task, and cost per task for each.
5. Record both rows in the results log, then set D27 to accepted or rejected with one line of evidence.

## Tests

- `tests/unit/agent-session-strategy.test.ts` — strategy B builds a session with only the expected tools and the task card as system prompt, and disposes it; the `task_result` tool terminates the turn and yields structured details.
- The experiment itself is evidenced by the results-log rows, not by an assertion on which strategy wins.

## Done when

Both strategies run the same suite behind one switch, two rows exist in the results log with all three metrics, and D27 has been moved out of `hypothesis` with the evidence line that settled it.
