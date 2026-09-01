# V1-01-T01: Register and session

Status: planned  
Story: V1-01

## Spec

A user can register, log in, read `GET /me`, and log out. Wrong password is rejected. Session is a cookie or JWT the rest of V1 can reuse. No Clerk/Stripe required.

## Possible

In-memory or file-backed account store in the API process. Tests start `src/hosts/web` with a temp home. Password hashing can be a single scrypt/argon2 call.

## Do

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`
- Persist session so a second HTTP client with the cookie is authenticated
- Keep `BSA_TOKEN` working for power-user paths; consumer tests must not need it

## Tests

`tests/e2e/v1-01-session.test.ts`

- Signup → login → `GET /me` returns the email/id
- Wrong password → 401
- Logout → `GET /me` → 401

## Done when

`npm test` includes the session E2E and fails if register/login/`/me` do not persist.
