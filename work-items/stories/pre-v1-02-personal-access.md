# PRE-02: Personal Access Without Billing

Status: planned

As the only user, I register or sign in and start browser runs with no payment step. The public host is not an open signup.

## Acceptance criteria

- Register/login/session/`GET /me` work as in V1-01.
- `startRun` / `/browser-start` never returns `payment_required` for this cut.
- Registration can be locked (`BSA_REGISTER_OPEN=0` or equivalent) so further signups are rejected after the personal account exists.
- `BSA_TOKEN` remains a power-user escape hatch; consumer UI does not require `?token=`.
- Do not add Stripe or Clerk.

## Decisions

See `docs/pre-v1.md`. Invert V1-08: unpaid is allowed, not gated.

## Tasks

- [PRE-02-T01](../tasks/pre-v1-02-t01-unpaid-start.md)
- [PRE-02-T02](../tasks/pre-v1-02-t02-register-lock.md)

## Tests

HTTP + chat start-run without mark-paid; register-lock E2E. See `docs/test-design.md` (PRE-02).
