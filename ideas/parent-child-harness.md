# Parent/child harness: clock, scratch, and the TUI

**Status:** ready
**Captured:** 2026-09-06
**Do not promote until:** T1–T5 have been implemented or this file is copied into a work-item epic.

The parent is a browser operator. A coding child is a Pi JSON subprocess whose cwd is goal scratch. A live TUI run showed harness gaps that are **not** site-specific: Unicode overflow crashed Pi, a 180s wall SIGTERM'd a still-useful child four times, the parent could not read the files the child left, Execute injected a new turn after work had already started, and `subagent` never hit `payloads.jsonl`.

This amends AGENT-11-T02’s “no `scratch_read`” line. Peek/`file://` stay not a file reader. Scratch is a confined parent file seam.

## Deferred

- Per-call child `model` (D12: floors stay on packaged agent frontmatter / Ctrl+P).
- Child-initiated “please extend” IPC (stdin ignored; a long `bash` never gets a turn).
- Raising the default 180s slice globally.

## T1 — Clip by visible width

Pi aborts if any rendered line’s visible width exceeds the pane. `fitLine` / `wrapToWidth` used `string.length`. Double-width glyphs overflow.

## T2 — Scratch is a parent file seam

`peek` of a scratch JSON is empty chrome. After an aborted child, the only copy of the work was on disk. `scratch_ls` / `scratch_read` (confined, capped). Every `subagent` reply includes an inventory. Peek still refuses data documents.

## T3 — Host owns the child clock

The wall is our `setTimeout`, not Pi. On expiry: confirm, child keeps running, then extend one slice or SIGTERM. Cap total time and extensions. `isError` on abort and provider errors. Capability copy from those constants.

## T4 — Blocking UI must not steal a turn

`/plan` Execute waits on `select()` inside `agent_end`. If the session gained a user or assistant message while waiting, do not `triggerTurn`.

## T5 — Parent-only tools hit the goal log

`subagent` (and scratch tools) record `tool_result` / payload like `composeAgent` tools. Digest and inventory only — not the child transcript (D29).
