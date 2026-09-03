# Web chat + desktop node

Consumer V1 (accounts, Windows/Mac helper, no token paste) is specified in `docs/v1.md`. Pre-V1 (personal production: same protocol, no billing, Docker helper, `agent.trustless-commerce.com`) is [`docs/pre-v1.md`](pre-v1.md). This page is the operator/deploy view of the same core.

The product stays one `BrowserSession` / `BrowserWorker` / evidence store. Two hosts sit on that core:

| Host | Where | Role |
| --- | --- | --- |
| Pi TUI (`npm run cli`) | Laptop / desktop | Local-dev CLI. In-process Chromium. **No VPS, no pair.** |
| Web API (`src/hosts/web`) | Weak VPS | `createAgentSession`, chat WebSocket, static UI. **No Chromium. UI-only.** |
| Node agent (`src/hosts/node-agent`) | Desktop | Playwright Chromium + profile. Outbound WebSocket to the hosted API. |

```
phone / laptop  →  gateway TLS  →  ui (static) + api (Pi SDK)
                                      ↕  tool RPC + JPEG frames
desktop node agent  →  BrowserWorker  →  dedicated Playwright Chromium
```

Local checkout: `npm run cli` is the whole product (Pi TUI + Chromium). It does not connect to the VPS.

CLI on a desktop that is already paired to the hosted UI can still attach to the same `worker.json` CDP endpoint. Do not run two Chromiums against one profile.

## Auth (Pre-V1 / V1)

Product path: register or sign in at the same origin (session cookie `bsa_session`). Pair the desktop from **Pair this computer** (`POST /pair/issue`). The helper uses a **device token**, not `BSA_TOKEN`. Do not put `?token=` in the consumer URL.

Power-user escape: `BSA_TOKEN` on chat `/chat` and node `/node` hello (or `Authorization: Bearer`). Optional HTTP basic for the static UI: `BSA_BASIC_USER` / `BSA_BASIC_PASS`.

## Easy path: Docker (CI builds the images)

GitHub Actions (`.github/workflows/docker.yml`) builds and pushes:

- `ghcr.io/<owner>/browser-session-api` — VPS, no Chromium
- `ghcr.io/<owner>/browser-session-ui` — static chat
- `ghcr.io/<owner>/browser-session-node` — Playwright Chromium for the **desktop**

The node image is meant to run **on your desk**, not on the VPS. Chromium stays in that container; the profile is a bind mount.

### One-machine trial

```bash
cp .env.example .env   # set BSA_TOKEN for the power-user escape if you want it
docker compose -f deploy/docker/compose.local.yml up --build
# http://127.0.0.1:8080/ — register in the UI, then Pair this computer
```

### Desktop node only (API already on a VPS)

```bash
# After Pair this computer in the signed-in UI (no repo checkout):
curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=<code> bash
# checkout / Docker: scripts/run-desktop-node.sh or deploy/docker/compose.node.yml
```

`BSA_TOKEN` is optional. After the first pair, the helper reconnects from `{BSA_HOME}/credentials/device.json`.

Default in Docker is **headless**. Takeover is the live-view panel (input only while `awaiting_takeover`). For a real window on Linux, set `BSA_HEADLESS=0` and mount X11 (see `compose.node.yml`).

First pull of the node image is large (Playwright’s Chromium). After CI has published it, setup is pull-and-run — no `npx playwright install` on the host.

## Run locally without Docker

```bash
# VPS-shaped API (no Chrome). BSA_NO_PI stubs chat for local protocol work only.
BSA_NO_PI=1 npm run start:api

# Desktop node (headed Chromium by default) — pair from the UI, or power-user:
npx playwright install chromium
BSA_PAIR_CODE=<code> npm run start:node -- --api ws://127.0.0.1:8787/node
```

Open `http://127.0.0.1:8787/`, create an account, then **Pair this computer**. Do not use `?token=` for the consumer path. `BSA_TOKEN=dev` remains a power-user escape (`/?token=dev`).

## Live view and takeover

The node streams **CDP screencast** JPEGs (`Page.startScreencast`) through the API. CDP stays on localhost on the desktop; the API relays frames.

Pointer and key events from the web panel are forwarded **only** while the run is `awaiting_takeover`. The headed window on the desk remains the best takeover surface.

If the desktop sleeps, `/healthz` and chat show `browser node disconnected`. Browser tools fail closed. Chat and slash commands still work.

## Cost routing (do not add a second router)

Wire Pi’s own packages on the API image:

- **`pi-model-auto`** — one `/model` choice (Pi Router). Each turn picks Low / Medium / High / Ultra from *authenticated* models and the cheapest that meets the floor. Pin with `@low` / `@high` / `@ultra` or `@model:provider/id`.
- **`pi-meter`** — soft daily/session budgets auto-downshift (for example Opus → Sonnet); hard caps refuse new prompts.

Suggested policy for this product:

| Work | Floor |
| --- | --- |
| Inspect, obvious clicks, form fill, JSONLint-class pages | low / medium |
| Ambiguous DOM, recovery after a failed expect, “should I take over?” | high |
| First-time site / messy SPA / login diagnosis | ultra, then downshift |
| Compaction / summarization of long evidence | low |

See `docs/decisions.md` (D12, D13).

## vibed-infra (VPS only)

Package **`ui` + `api` + `gateway`**. Do **not** install a `nodes` role or Playwright on that box.

Configs live in `deploy/vibed/`. On a laptop without this repo: `curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=… bash`. A checkout can still use `scripts/run-desktop-node.sh`.

Pre-V1 production host is `agent.trustless-commerce.com`. Apply steps: [`docs/pre-v1-runbook.md`](pre-v1-runbook.md). The gateway must also proxy account and pairing HTTP (`/auth`, `/me`, `/pair`, `/devices`) to the API, not only `/chat` and `/node`.
