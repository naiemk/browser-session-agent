# AGENT-05: Irreversible actions are gated

Status: todo

As the operator, the agent can experiment freely with anything recoverable, and never fires something permanent without live proof and my policy allowing it.

## Acceptance criteria

- Every action is classified `probe`, `reversible`, `navigational`, or `committing`, judged from the affordance rather than the verb.
- The same verb classifies differently by target: "Show more" is not "Submit".
- Unknown or ambiguous resolves to `committing`.
- Each classification records an audit reason on the action event.
- A `committing` action requires live criteria to pass; remembered or predicted knowledge can never satisfy the gate (D25).
- Approval policy per goal is `auto`, `ask` (default), or `never`; `never` fails closed with a clear code.
- Before-and-after evidence exists for every committing action.
- A navigational action checkpoints URL and known field values; a retry restores them.
- A fixture whose submit works once proves it is never fired twice.
- Cases where preconditions already passed are logged, so relaxing to `auto` can be argued from data later.

## Decisions

D23 (per-action judgment, unknown means committing), D25 (memory may not authorize), D32 (help is queued, not interruptive), D30 (rehearsal deferred; this story is its cheap substitute).

## Tasks

- [AGENT-05-T01](../tasks/agent-05-t01-reversibility-judgment.md)
- [AGENT-05-T02](../tasks/agent-05-t02-commit-gate.md)

## Tests

`tests/unit/agent-reversibility.test.ts`, `tests/unit/agent-checkpoint.test.ts`, `tests/e2e/agent-05-commit-gate.test.ts`.
