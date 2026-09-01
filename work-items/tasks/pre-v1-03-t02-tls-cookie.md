---
id: PRE-03-T02
title: Secure cookie on HTTPS
story: PRE-03
epic: pre-v1
status: planned
---

# PRE-03-T02 — Secure cookie on HTTPS

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md)
- [docs/web-operator.md](../../docs/web-operator.md) — session cookie

## Possible

- `src/hosts/web/http.ts` — `Set-Cookie` / `bsa_session`

## Do

1. When the API believes the request is HTTPS (TLS terminator / `X-Forwarded-Proto` / config), the session cookie is `Secure` (and remains `HttpOnly`; `SameSite` as today).
2. Local HTTP tests still get a usable cookie (no `Secure` required on plain http://127.0.0.1).
3. Host string `BSA_HOST=agent.trustless-commerce.com` is the production origin.

## Tests

`tests/e2e/pre-v1-03-tls-cookie.test.ts`

## Done when

HTTPS session cookie is `Secure`. HTTP local still works. Test is in CI.
