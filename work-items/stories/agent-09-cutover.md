# AGENT-09: Cutover, and delete the old core

Status: todo

As the team, the new core replaces the old one only when the suite says it is better, and the old one disappears in the same change so the repo never carries two agents.

## Acceptance criteria

- The suite runs against either core from one target switch, at the same commit.
- Both rows exist in the results log before anything is flipped.
- The default flips only if the new core matches or beats the baseline on success rate at equal or lower cost per task.
- The same change deletes every path on D34's rebuilt list, removes the target switch, and deletes tests that only covered the old core.
- The kept list survives untouched: transport, driver, product shell, `bin/`, `deploy/`.
- `npm test` passes with no skipped or quarantined tests, and no source file references a deleted path.
- `docs/architecture.md` describes the shipped core, and Lessons records what the rewrite cost and bought.
- If the new core loses, the default does not flip; the gap and what would close it are written down.

## Decisions

D35 (cutover gate and deletion trigger), D34 (boundary), D19 (baseline is the old agent).

## Tasks

- [AGENT-09-T01](../tasks/agent-09-t01-cutover-and-delete.md)

## Tests

The suite itself, run twice. Plus `npm test` green with the old core removed.
