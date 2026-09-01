# V1-01-T03: Chat UI sign-in

Status: planned  
Story: V1-01  
Depends: V1-01-T02

## Spec

The static chat UI signs in through a form, sends a message, and shows the reply. The URL has no `?token=`.

## Possible

Playwright drives `src/hosts/web/public` against the same API as T02. Sign-in can be a simple email/password form that stores the session cookie.

## Do

- Sign-in view on the static UI
- After login, existing chat composer works
- Do not put the session secret in the query string

## Tests

`tests/e2e/v1-01-chat-ui.test.ts`

- Open UI without `?token=`
- Fill sign-in, submit
- Send a message, assert the reply is visible
- Page URL never contains `token=`

## Done when

A browser-only path (no curl, no token in the URL) can sign in and chat.
