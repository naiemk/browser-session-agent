# Web chat + desktop node

Consumer V1 (accounts, Windows/Mac helper, no token paste) is specified in `docs/v1.md`. Pre-V1 (personal production: same protocol, no billing, Docker helper, `agent.trustless-commerce.com`) is [`docs/pre-v1.md`](pre-v1.md). This page is the operator/deploy view of the same core.

The product stays one `BrowserSession` / `BrowserWorker` / evidence store. Two hosts sit on that core:

| Host | Where | Role |
| --- | --- | --- |
| Pi TUI (`src/extension.ts`) | Desktop (optional) | Thin CLI adapter. Same tools, commands, profile. |
| Web API (`src/hosts/web`) | Weak VPS | `createAgentSession`, chat WebSocket, static UI. **No Chromium.** |
| Node agent (`src/hosts/node-agent`) | Desktop | Playwright Chromium + profile. Outbound WebSocket to the API. |

```
phone / laptop  →  gateway TLS  →  ui (static) + api (Pi SDK)
                                      ↕  tool RPC + JPEG frames
desktop node agent  →  BrowserWorker  →  dedicated Playwright Chromium
```

CLI on that same desktop can still attach to the same `worker.json` CDP endpoint. Do not run two Chromiums.

## Auth (v1)

- Shared secret: `BSA_TOKEN` on chat `/chat` and node `/node` hello (or `Authorization: Bearer`).
- Optional HTTP basic for the static UI: `BSA_BASIC_USER` / `BSA_BASIC_PASS`.

## Easy path: Docker (CI builds the images)

GitHub Actions (`.github/workflows/docker.yml`) builds and pushes:

- `ghcr.io/<owner>/browser-session-api` — VPS, no Chromium
- `ghcr.io/<owner>/browser-session-ui` — static chat
- `ghcr.io/<owner>/browser-session-node` — Playwright Chromium for the **desktop**

The node image is meant to run **on your desk**, not on the VPS. Chromium stays in that container; the profile is a bind mount.

### One-machine trial

```bash
cp .env.example .env   # set BSA_TOKEN
docker compose -f deploy/docker/compose.local.yml up --build
# http://127.0.0.1:8080/?token=$BSA_TOKEN
```

### Desktop node only (API already on a VPS)

```bash
export BSA_API_URL=wss://api.example.com/node
export BSA_TOKEN=…
scripts/run-desktop-node.sh
# or: docker compose -f deploy/docker/compose.node.yml up -d
```

Default in Docker is **headless**. Takeover is the live-view panel (input only while `awaiting_takeover`). For a real window on Linux, set `BSA_HEADLESS=0` and mount X11 (see `compose.node.yml`).

First pull of the node image is large (Playwright’s Chromium). After CI has published it, setup is pull-and-run — no `npx playwright install` on the host.

## Run locally without Docker

```bash
# VPS-shaped API (no Chrome)
BSA_TOKEN=dev BSA_NO_PI=1 npm run start:api

# Desktop node (headed Chromium by default)
npx playwright install chromium
BSA_TOKEN=dev npm run start:node -- --api ws://127.0.0.1:8787/node
```

Open `http://127.0.0.1:8787/?token=dev`.

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

Configs live in `deploy/vibed/`. Prefer Docker on the desktop (`scripts/run-desktop-node.sh`). The npm/systemd installer is `scripts/install-desktop-node.sh` if you do not want a container.

Pre-V1 production host is `agent.trustless-commerce.com` (see `docs/pre-v1.md`). The gateway must also proxy account and pairing HTTP (`/auth`, `/me`, `/pair`, `/devices`) to the API, not only `/chat` and `/node`.
