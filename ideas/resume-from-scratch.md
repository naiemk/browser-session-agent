# Resume from scratch, do not rebuild

**Status:** ready
**Captured:** 2026-09-07
**Depends on:** parent-child harness (scratch_ls / scratch_read, inventory on every subagent reply)

Live TUI run `goal_mtqivwbw001`: the parent spawned coder four times to harvest a public job board. The first child was SIGTERM'd (exit 143) after writing `findings.md` and HTML dumps. The parent `scratch_read` the same 2k prefix twice (no offset). The next child did not see those files and started over. A later child actually wrote `candidates.json`; the parent still spawned again. The TUI sat on `worker exit ?`.

The files were the artifact. The parent could list names. That is not resume. Three gaps:

1. **The child starts cold.** Spawn is `Task: …` only. Existing scratch is the child's cwd, not its prompt, so it rebuilds.
2. **The parent cannot page a file.** `scratch_read` always returns chars 0–2000. A truncated read retried is the same prefix. The model never sees the rest, so it assumes the work is incomplete.
3. **Abort looks like “try coder again.”** The digest is the child's last chat (“Let me write findings…”), not a resume instruction. Inventory is alphabetical and capped, so the newest file can fall under “… more”.

This is not a YC playbook. Any long child that writes incrementally hits the same loop.

## Tickets

### T1 — Spawn carries the scratch inventory

Before `runtime.run`, list scratch and prepend a resume preamble to the task: existing files (newest first) and “continue; do not rebuild or re-fetch what is on disk.” Empty scratch is a no-op. The child's `Task:` line stays one user message (D12 floors unchanged).

Acceptance: a spawn after `partial.json` is already on disk includes that name in the child task and the words “do not rebuild”.

### T2 — `scratch_read` offset

`offset` is a character offset. Cap per call stays `DIGEST_MAX_CHARS`. The **text** the model sees must say how to continue (`truncated at 2000 of 5820 chars; scratch_read name=… offset=2000`), not only a details flag. Binary and jail rules unchanged.

Acceptance: two reads of a 2080-char file (offset 0, then offset 2000) cover the whole file with no overlapping prefix on the second call.

### T3 — Standing scratch on every parent turn

`before_agent_start` already refreshes `scratch/plan.md`. Also inject a short newest-first inventory when scratch is non-empty: continue from these files; after abort, read before spawning; use offset if truncated. Names and sizes only — not file bodies, not the child transcript.

Acceptance: `standingScratchPrompt` includes a newly written file without calling `scratch_ls`.

### T4 — Abort reply is a resume cue

When `aborted` or nonzero, `formatWorkerReply` tells the parent: partial files remain; do not repeat the same harvest; `scratch_read` (offset if truncated); the next coder task names only the gap.

Acceptance: an aborted subagent result still lists files and matches that resume instruction.

### T5 — Card, worker hint, coder frontmatter

One card sentence: after a killed coder, read scratch; do not start the harvest over. `CHAT_WORKER_HINT` and `coder.md`: look at existing files first; write incrementally; do not re-download.

## Out of scope

- Auto-approving host extend/`timeoutMs` confirms because the operator said “approve automatically” in chat. That is overnight policy, not wired to `ctx.ui.confirm`. Confirm ignored still SIGTERM (parent-child T3).
- Raising the default 180s slice globally (already deferred).
- Dumping the child transcript into the parent (files stay the artifact).
- Site-specific harvest scripts.

## Implementation sketch

```
subagent(task)
  ├─ list scratch → prepend resume preamble → child
  └─ abort → inventory + “read, don’t rebuild”

scratch_read(name, offset)
  └─ slice + footer with next offset in the text

before_agent_start
  └─ standing plan.md + standing scratch inventory
```
