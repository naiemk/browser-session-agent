# Perception, not strategy — pageable scratch + inventory as facts

**Status:** ready
**Captured:** 2026-09-07
**Depends on:** parent-child harness (scratch_ls / scratch_read, inventory on every subagent reply)

Overnight `goal_mtqivwbw001`: parent spawned coder in a loop. The child wrote files, got SIGTERM, the parent could not page past 2k of `findings.md`, the next child started cold (`--no-session` + `Task:` only). Abort looked like empty, so a second harvest *felt* required. Later `candidates.json` existed and the parent spawned again anyway.

Two missing **perceptions**, not a missing strategy:

- Parent cannot see file bodies past a prefix (`scratch_read` had no offset).
- Child has no memory of prior turns; cwd files are there but not in context.

The host must not classify continue vs redo vs new job. That is the agents’ route (same as “the route is yours” on the page). Repeat is valid when the files are the wrong bytes. “A few more features” is the same job as a delta — the **coder** judges that from cwd + this `Task:`, not from host copy like “do not rebuild.”

## This slice (perception)

- `scratch_read` takes a character `offset`; cap stays 2k. Truncation footer is in the **text**: `offset=N to continue`. No “do not repeat.”
- If scratch is non-empty, prepend a newest-first **name/size list** to the child task. Empty scratch: unchanged `Task:`. Standing inventory on `before_agent_start` is names/sizes only.
- Abort reply: inventory + digest + `aborted`. No harvest policy.

## Follow-up: persistent coder session (spiked, not load-bearing)

Pi already has `--session-id`, `--session-dir`, `--continue`. We still spawn with `--no-session`. A persistent coder (`--session-dir` under the goal, not `profile/` or scratch; `--session-id coder`) would let the child see prior turns + the new ask, so “a few more features” vs “this is LinkedIn now” is the child’s judgment.

**Spike pass/fail:** one goal, two `subagent` calls, second ask is a delta; child edits existing files without re-fetching *because it remembers*, not because the host forbade fetch.

**Spike notes (2026-09-07):** mechanical knobs are fine. `json -p` + `--session-id coder` + `--session-dir` + a floor `@file` include parse and load prior turns. `--no-session` still forces in-memory, so persistence requires dropping it. A truncated jsonl (SIGTERM-shaped) still opens but drops the smashed entry.

Live two-call (concrete OpenRouter flash, same argv shape, no host fetch ban): spawn 2 reused the `coder` session and recalled a secret that was **not** on disk after spawn 1. It did not curl. It also **overwrote** `findings.md` on both calls (lost the original lines, then lost `first-pass`). That is not “edit existing files.” Chat and cwd disagreed; chat won. D31 says files should win, which means the child still has to `ls` first and weakens the session bet.

Until a delta spawn **keeps** prior file bytes and changes them because it remembers, spawn stays `--no-session`. Planner/writer/reviewer stay ephemeral. Do not put the session dir inside scratch (the child would see jsonl). If we take this later: `--session-dir` under the goal directory, `--session-id coder` only.

Costs we have not measured: stale harvest chat when the ask moved on; compaction dropping the useful bit; half-written session on SIGTERM; two truths (chat vs files). D31 says files win — then the child must still `ls` first.

Keep-alive (host extend) is already there for “three more minutes.” It does not survive exit. It is not a substitute for session-on-disk.

## Not this

- Job keys, receipts, `resume: true`, circuit breakers.
- Auto-approve host extend / raising 180s.
- Parent ingesting the child transcript (D29).
- YC/LinkedIn playbooks.
- Per-call child `model` (still D12 frontmatter).
