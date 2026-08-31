# MVP-04: Evidence and Recovery

Status: planned

As an operator, I can understand what the agent saw, did, and why it stopped.

## Acceptance criteria

- Runs persist observations, actions, screenshots, and errors under `runs/<runId>/`.
- Failed actions receive a recovery note that cites new evidence (URL, missing text/ref, dialog, console error).
- After worker restart, the run resumes from `state.json` plus live browser state; the event log is not replayed as actions.

## Decisions

See `docs/decisions.md` D7.

## Tasks

- [MVP-04-T01](../tasks/mvp-04-t01-evidence-recovery-resume.md)

## Tests

JSONL + screenshot files, recovery citation, reconstruct worker from disk. See `docs/test-design.md`.
