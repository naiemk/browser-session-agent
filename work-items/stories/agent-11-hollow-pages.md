# AGENT-11: Hollow pages, fake pages, and a long epoch

Status: done

As the operator, when a navigate or peek lands, the harness returns a painted page (or
honestly says it is not a page). Stale snapshots from the current sub-goal do not
accumulate until the operator speaks again.

Evidence: live run `goal_mtpnwou0001` (54 turns, peak context 307,986 B). AGENT-10 crashes
were gone; leftover cost was hollow URL-passes, `file://` JSON treated as a page, and
compaction that only runs at the last user message.

## Acceptance criteria

- A navigate or peek URL-pass is not final until two consecutive reads agree on URL and
  control count, or the settle budget ends. `check` and click still trust a pass on sight.
- Peek, side-tab open, and the stranger view refuse a data document the same way navigate
  and probe already do: content type and byte length, not a body, `matched` false.
- An unknown expect kind is rejected without a canned download note.
- Failed-request URLs on an action result are clipped once, not duplicated unclipped.
- Superseded snapshots inside the current epoch are placeholdered (`keepLatest` 1). The
  placeholder prefix is then stable; `rewrittenFrom` is not 0 every turn.

## Skipped (do not task)

- Raising the wire control cap, reordering controls by recency, treating a path rewrite as
  a URL hit, a parent `scratch_read` tool, collapsing probe `HomeHome`, site-specific
  overlay expects. Evidence for each skip is in the AGENT-11 task notes and the live-run
  evaluation; they are model strategy or working-as-designed.

## Decisions

D17 (harness accepts), D21 (probe is grep), D22 (exfiltration into context), D29 (turn
cost). Compaction still must not rewrite the front of the prompt every turn.

## Tasks

- [AGENT-11-T01](../tasks/agent-11-t01-stable-settle.md)
- [AGENT-11-T02](../tasks/agent-11-t02-data-peek.md)
- [AGENT-11-T03](../tasks/agent-11-t03-expect-note.md)
- [AGENT-11-T04](../tasks/agent-11-t04-clip-failures.md)
- [AGENT-11-T05](../tasks/agent-11-t05-epoch-snapshots.md)

## Tests

Named on each task.
