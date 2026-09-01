---
id: PRE-05-T01
title: UI on same origin (no ?token=)
story: PRE-05
epic: pre-v1
status: done
---

# PRE-05-T01 — UI on same origin (no `?token=`)

## Spec

- [docs/pre-v1.md](../../docs/pre-v1.md)
- [docs/web-operator.md](../../docs/web-operator.md) — consumer chat UI

## Possible

- `src/hosts/web/public/index.html` / `app.js` / `app.css`
- `src/hosts/web/http.ts` — `/auth` `/me` `/pair`

## Do

1. Playwright against the public UI + API routes on the same origin: sign-in overlay, session cookie, no `?token=` in the URL.
2. After pair, **Connected** pill. Live JPEG frames. Takeover / resume controls exist.
3. `BSA_TOKEN` query string is not the consumer path (operator escape may still exist; the product URL must not require it).

## Tests

`tests/e2e/pre-v1-05-chat-ui.test.ts`

## Done when

Same-origin sign-in + Connected + live view + takeover without `token=` in the URL. Test is in CI.
