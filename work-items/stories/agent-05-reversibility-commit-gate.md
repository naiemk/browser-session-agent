# AGENT-05: Irreversible actions are gated

Status: todo

As the operator, the agent can experiment freely with anything recoverable, and never fires something that leaves this session without live proof and my policy allowing it.

## Acceptance criteria

- Every action is classified on two axes, judged from the affordance rather than the verb: recoverability (`probe`, `reversible`, `navigational`, `unknown`) and authorization (`none`, `outbound`, `destructive`).
- The same verb classifies differently by target: "Show more" is not "Submit". A Users-like name and a Send name on the same `click` differ on authorization.
- Unknown recoverability is the default for unmatched / unnamed / missing ref. It is not a human ask.
- Authorization defaults to `none`. Unmatched is not authorized. Only outbound / destructive commits wait on policy.
- Each classification records audit reasons (two `ruleId`s) on the action event.
- An authorized commit requires live criteria to pass; remembered or predicted knowledge can never satisfy the gate (D25).
- Approval policy per goal is `auto`, `ask` (default), or `never`; `never` fails closed with a clear code. `ask` means ask on Send, not on Users.
- Before-and-after evidence exists for every authorized commit.
- Navigational and unknown actions checkpoint URL and known field values; a failed unknown expect restores them; `act kind: restore` reloads the latest tag.
- A fixture whose submit works once proves it is never fired twice.
- Cases where preconditions already passed are logged, so relaxing to `auto` can be argued from data later. Asks on `authorization=none` are counted and should be 0.

## Decisions

D23 (per-action recoverability and authorization; unknown is not an ask), D25 (memory may not authorize), D32 (help is queued, not interruptive), D30 (rehearsal deferred; this story is its cheap substitute).

## Tasks

- [AGENT-05-T01](../tasks/agent-05-t01-reversibility-judgment.md)
- [AGENT-05-T02](../tasks/agent-05-t02-commit-gate.md)

## Tests

`tests/unit/agent-reversibility.test.ts`, `tests/unit/agent-checkpoint.test.ts`, `tests/e2e/agent-05-commit-gate.test.ts`.
