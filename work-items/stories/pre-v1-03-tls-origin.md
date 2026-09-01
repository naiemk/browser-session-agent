# PRE-03: TLS Origin agent.trustless-commerce.com

Status: done

As a user, I open https://agent.trustless-commerce.com, sign in with a secure cookie, and chat and pair over TLS.

## Acceptance criteria

- Host is `agent.trustless-commerce.com` in vibed-infra (`BSA_HOST`).
- HTTPS session cookie `bsa_session` is `HttpOnly`, `SameSite=Lax`, and `Secure`.
- Same-origin fetch to `/auth`, `/me`, `/pair` succeeds (gateway does not send those paths to the static UI).
- WebSockets `/chat` and `/node` upgrade through the gateway.
- `/healthz` reaches the API.

## Decisions

See `docs/pre-v1.md` and `docs/web-operator.md` (vibed-infra). Same origin via gateway so Lax cookies work.

## Tasks

- [PRE-03-T01](../tasks/pre-v1-03-t01-gateway-routes.md)
- [PRE-03-T02](../tasks/pre-v1-03-t02-tls-cookie.md)

## Tests

File assertions on gateway/vibed configs; cookie flags when TLS is on. See `docs/test-design.md` (PRE-03).
