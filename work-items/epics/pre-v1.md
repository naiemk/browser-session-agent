# Epic: Pre-V1 Personal Production

Status: done (100% — all 12 tasks have implementations and passing E2Es)

## Outcome

The operator signs in at **https://agent.trustless-commerce.com**, pairs a Docker Playwright helper on the desktop (no `BSA_TOKEN`, no Win/Mac installer), and the **hosted Pi agent** inspects and acts on that Chromium. No payment. Login/CAPTCHA uses takeover and live view. Quitting the helper fails browser tools closed with `helper_disconnected`. Chat still works.

This is the product boundary in `docs/pre-v1.md`: V1 minus billing and OS packages. Docker helper + vibed-infra VPS are the deploy path.

## Risks

- production must not set `BSA_NO_PI` or the “agent” is a stub
- gateway must proxy account/pair HTTP or sign-in 404s on the static UI
- session cookie must be `Secure` on HTTPS
- Docker node compose/scripts must not require `BSA_TOKEN` for the consumer path
- the VPS must not run Chromium (D11)
- public hostname + open register is not a personal deployment
- CI must not call live LLM vendors; keep `BSA_NO_PI` except PRE-01 wiring tests

## Stories

- PRE-01: Hosted Pi agent
- PRE-02: Personal access without billing
- PRE-03: TLS origin agent.trustless-commerce.com
- PRE-04: Docker Playwright helper
- PRE-05: Chat UI is the product
- PRE-06: VPS pack (vibed-infra)
- PRE-E2E: Personal production gate

## Tasks

| Task | Story | Status |
| --- | --- | --- |
| [PRE-01-T01](../tasks/pre-v1-01-t01-pi-wired.md) | PRE-01 | done |
| [PRE-01-T02](../tasks/pre-v1-01-t02-agent-tools.md) | PRE-01 | done |
| [PRE-02-T01](../tasks/pre-v1-02-t01-unpaid-start.md) | PRE-02 | done |
| [PRE-02-T02](../tasks/pre-v1-02-t02-register-lock.md) | PRE-02 | done |
| [PRE-03-T01](../tasks/pre-v1-03-t01-gateway-routes.md) | PRE-03 | done |
| [PRE-03-T02](../tasks/pre-v1-03-t02-tls-cookie.md) | PRE-03 | done |
| [PRE-04-T01](../tasks/pre-v1-04-t01-docker-helper.md) | PRE-04 | done |
| [PRE-05-T01](../tasks/pre-v1-05-t01-chat-ui.md) | PRE-05 | done |
| [PRE-05-T02](../tasks/pre-v1-05-t02-harness-plan-cards.md) | PRE-05 | done |
| [PRE-06-T01](../tasks/pre-v1-06-t01-vibed-pack.md) | PRE-06 | done |
| [PRE-E2E-T01](../tasks/pre-v1-e2e-t01-onboarding.md) | PRE-E2E | done |
| [PRE-E2E-T02](../tasks/pre-v1-e2e-t02-combobox-stable.md) | PRE-E2E | done |

Progress is 12/12 tasks. `tests/e2e/pre-v1-e2e-onboarding.test.ts` is the Pre-V1 CI gate. Live host smoke is manual.

## Spec pointers

- `docs/pre-v1.md` — product boundary
- `docs/v1.md` — full consumer V1 (billing + OS installers)
- `docs/web-operator.md` — API + node + vibed-infra
- `docs/decisions.md` — D11–D18
- `docs/test-design.md` — Pre-V1 E2E map
- `deploy/vibed/` — VPS pack
