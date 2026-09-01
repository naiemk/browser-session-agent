# Browser Operations Agent — Pre-V1 (personal production)

## Outcome

A **personal production cut** of V1: hosted chat on **https://agent.trustless-commerce.com**, a real Pi agent, pairing, harness, page plans, live view, and takeover. Playwright Chromium runs in a **Docker helper on the operator desktop**, outbound to the API. There is **no payment**. There is **no signed Windows/Mac installer**.

This is V1 minus billing and OS packages. The product must work as specified: sign in, **Connected**, start a goal, the agent inspects and acts, takeover for logins, fail closed if the helper quits. Chat still works when the helper is offline.

Docker and the Pi CLI are the Pre-V1 helper path (D14), not a consumer MSI/pkg (D15). Chromium does not run on the VPS (D11).

```
Your browser  →  https://agent.trustless-commerce.com  →  vibed-infra (ui + api + gateway)
Desktop Docker node  →  wss://agent.trustless-commerce.com/node  (device token, not BSA_TOKEN)
```

## In scope

- Hosted web app at `agent.trustless-commerce.com`: accounts, chat, live view, slash/command cards
- Real Pi `createAgentSession` on the API (no `BSA_NO_PI` in production)
- Same bounded tools as V1, including `browser_run_plan` and `browser_fill`
- Action harness and page plans (D17, D18)
- Pairing: one-time code or localhost claim → device token in the helper’s `BSA_HOME`
- Docker Playwright helper (`ghcr.io/naiemk/browser-session-node`): pair, reconnect, no `BSA_TOKEN`
- VPS pack via vibed-infra: ui + api + gateway, TLS, LLM keys on api
- Personal lock: registration can be closed so the public host is not an open signup
- `BSA_TOKEN` remains a power-user escape hatch

## Out of scope (Pre-V1)

- Stripe, Clerk, or any billing provider
- Signed/notarized Windows `.msi` / Mac `.pkg`
- Chromium or Playwright on the VPS
- Driving the user’s daily Chrome (D2)
- V2 supervisor graph / cloud-hosted browsers as default

## Exit criteria

1. Open `https://agent.trustless-commerce.com`, create (or sign in to) the personal account, no `?token=` in the URL.
2. Run the Docker helper, pair it, see **Connected**.
3. Start a goal in chat; Pi inspects and acts on the helper’s Chromium (harness + plans, not stub replies).
4. Login/CAPTCHA uses takeover + live view; after resume the agent continues from a fresh observation.
5. Quitting the helper makes browser tools fail with `helper_disconnected`; chat still answers.
6. `startRun` never returns `payment_required`.

## Host and pack

- **Origin:** `https://agent.trustless-commerce.com`
- **VPS:** [`deploy/vibed/`](../deploy/vibed/) — `BSA_HOST=agent.trustless-commerce.com`
- **Apply + pair runbook:** [`docs/pre-v1-runbook.md`](pre-v1-runbook.md)
- **Gateway** must proxy `/auth`, `/me`, `/pair`, `/devices`, `/chat`, `/node`, `/healthz` to the API; `/` is the static UI
- **Session cookie** `bsa_session`: `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS
- **API image** has no Playwright/Chromium ([`deploy/docker/Dockerfile.api`](../deploy/docker/Dockerfile.api))
- **Helper:** [`deploy/docker/compose.node.yml`](../deploy/docker/compose.node.yml) / [`scripts/run-desktop-node.sh`](../scripts/run-desktop-node.sh) with pair code or stored device token

## Relation to V1

Consumer V1 (`docs/v1.md`) adds payment and two-click OS installers. Pre-V1 reuses that protocol. Work items: [`work-items/epics/pre-v1.md`](../work-items/epics/pre-v1.md). Test map: [`docs/test-design.md`](test-design.md) (Pre-V1 section).

Automated CI keeps `BSA_NO_PI=1` and local fixtures. A live smoke against the real host is **manual** (LLM keys + your Docker helper).
