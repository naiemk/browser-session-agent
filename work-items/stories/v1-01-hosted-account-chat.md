# V1-01: Hosted Account and Chat

Status: done

As a new user, I can create an account, sign in on the web, and talk to the hosted agent without installing anything yet.

## Acceptance criteria

- Register and login persist a session; `GET /me` returns the signed-in account; logout clears it.
- Wrong password and missing session are rejected.
- An authenticated chat WebSocket accepts a prompt and returns an `agentEvent` without a helper connected.
- Unauthenticated chat is rejected (401 / close). The consumer UI does not use `?token=` or `BSA_TOKEN`.
- Accounts are vendor-agnostic: CI uses a testable session. Clerk (or similar) can replace the store later without changing these criteria.

## Decisions

See `docs/v1.md` (hosted web app) and `docs/decisions.md` D13, D15. Power-user `BSA_TOKEN` may remain as an escape hatch.

## Tasks

- [V1-01-T01](../tasks/v1-01-t01-register-and-session.md)
- [V1-01-T02](../tasks/v1-01-t02-authenticated-chat.md)
- [V1-01-T03](../tasks/v1-01-t03-chat-ui-sign-in.md)

## Tests

HTTP session E2E, authenticated chat WS, Playwright against the static UI. See `docs/test-design.md` (V1-01).
