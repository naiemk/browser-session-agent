---
id: PRE-02-T02
title: Registration lock
story: PRE-02
epic: pre-v1
status: planned
---

# PRE-02-T02 — Registration lock

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md) — personal lock (`BSA_REGISTER_OPEN=0` or allowlist)

## Possible

- `src/hosts/web/http.ts` — `POST /auth/register`
- `src/hosts/web/accounts.ts`
- `.env.example` / `deploy/vibed/vibed-infra-config.yml`

## Do

1. When registration is open (default for tests), `POST /auth/register` still creates an account.
2. When locked (`BSA_REGISTER_OPEN=0` or equivalent), new registration is rejected; existing login still works.
3. Optional allowlist is acceptable if documented. Public hostname must not stay an open signup after you have an account.

## Tests

`tests/e2e/pre-v1-02-register-lock.test.ts`

## Done when

Lock env is documented and enforced. Login of an existing account still works when registration is closed.
