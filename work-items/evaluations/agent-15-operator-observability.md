# Evaluation: AGENT-15 operator observability (subagent loop)

Date: 2026-09-09
Implementer: Auto (Grok)
Spec IDs: operator visibility; Pi-native subagent streaming; consecutive-failure breaker; semantic work-stream progress
Evidence: L0/L1 unit canaries replaying `goal_mttviohj001`

## Discovery

- Pi 0.85.1 `executePreparedToolCall` records `isError: false` for any returned tool result. A returned `{ isError: true }` is ignored; the child must throw (or a `tool_result` hook must set it).
- Magpi's `onUpdate` only forwarded `(running…)` plus tool names, so a 60-minute coder loop had no task, elapsed time, or child-tool line in the TUI.
- `extractTodoItems` stopped at the first `*`, so `1. **Research** directories` and `2. **Research** newsletters` both became `Research`.
- AGENT-15 attempt budgets existed for durable browser actions, not for interactive `subagent` calls. Thirteen sequential harvest prompts with seven abort-143s never tripped a host stop.

## Changes

- Dedicated `renderCall` / `renderResult` for `subagent` (Pi bundled-subagent layout, Magpi `Component`, no `pi-tui` import)
- Structured `onUpdate` details, 5s heartbeat, `setWorkingMessage` / `setStatus` / `setWidget`, cleared in `finally`
- Throw `SubagentFailure` on abort / nonzero / provider error; `terminate: true` after two failed slices or a stagnant work stream
- Semantic fingerprint (`strategyFamily` + deliverable + plan step); raw HTML, file count, tokens, and prompt rewording do not count
- Plan revisions via `PlanStore.recordRevision` when a plan.json exists; always via `appendEntry("subagent-progress")`
- Plan widget keeps distinct step labels and shows `completed/total · active step`

## Spec validation

| Requirement | Status |
| --- | --- |
| Pi-native live progress (`onUpdate`, working/status/widget, renderers) | Pass |
| Throw so Pi marks child abort/error | Pass |
| Two consecutive coder failures without checkpoint stop redispatch | Pass |
| Resume reconstructs the streak from session entries | Pass |
| Differently worded harvest prompts share one work-stream fingerprint | Pass |
| Raw fetches / file-count growth do not reset the budget | Pass |
| Recorded strategy change required before retrying as compose | Pass |
| Distinct research phases remain distinct in the plan widget | Pass |
| Hosted operators see working/status via notify | Pass (`setWorkingMessage` → notify) |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 2 | 4 | Pi ignores returned `isError`; throw + terminate now match the runtime |
| Boundaries | 3 | 4 | Packaged agents, scratch cwd, timeout cap, no browser profile unchanged |
| Observability | 1 | 4 | Live task/tool/elapsed; halt names the stream and recovery options |
| Test realism | 2 | 4 | Replay of Magpie harvest prompts + abort-143 streak |
| Maintainability | 3 | 4 | Fingerprint/breaker isolated from spawn |

## Improvement pass

- Harvest classifier now matches `newsletters` / `harvesting` / `communities`, not only exact `newsletter`.
- A blocked stream no longer unblocks just because the prompt's work-stream string changed; a recorded `requiredFamily` is required.
- `requiredFamily` survives a failed compose attempt so harvest cannot sneak back.

## Residual

- Live TUI confirmation that `setWorkingMessage` is visible in Pi 0.85.1 interactive mode (unit double only).
- Wiring the same fingerprint into durable Jobs V2 ticks is still open; this is the interactive parent tool.
- Berlin-style precision/recall on work-stream labels is not measured.
