# Pre-V1 runbook — VPS + laptop

Apply this pack yourself. This document is the operator path for **https://agent.trustless-commerce.com**. The agent that produced these files does **not** SSH to the VPS, set DNS, or run vibed-infra.

Product page: [`docs/pre-v1.md`](pre-v1.md). Pack files: [`deploy/vibed/`](../deploy/vibed/).

## 1. Images

CI (`.github/workflows/docker.yml`) publishes:

- `ghcr.io/naiemk/browser-session-api`
- `ghcr.io/naiemk/browser-session-ui`
- `ghcr.io/naiemk/browser-session-node` (laptop helper only)

`:latest` is pushed **only from `main`**. Pull requests get a `pr-<n>` tag; other pushes get a git-sha tag. Until this branch is on `main`, either:

- build the API/UI images on the VPS from this commit, or
- pin `ghcr.io/naiemk/browser-session-api:<sha>` (and the matching UI tag) in `deploy/vibed/vibed-infra-config.yml`.

Do not set `BSA_NO_PI` or `BSA_PI_FAIL` on the API.

## 2. DNS and TLS

Point `agent.trustless-commerce.com` at the VPS. The vibed gateway site has `tls: true`. Outer TLS must send `X-Forwarded-Proto` when it can; the inner nginx passes that header through and falls back to `https`. The API also sets `BSA_COOKIE_SECURE=1` so `bsa_session` is `Secure` even if proto is missing.

## 3. Apply on the VPS (ui + api + gateway only)

Use the files in `deploy/vibed/`:

- `vibed-infra-config.yml`
- `api-config.yaml`
- `ui-config.yaml`
- `gateway.conf` (inner nginx)

Install **ui + api + gateway** only. **Do not** add a `nodes` role, **do not** wget `install-nodes.sh` onto the VPS, **do not** install Playwright or Chromium there.

Persist `/var/lib/browser-session` → `/data` on the API (accounts, `BSA_AGENT_DIR`, `BSA_SESSION_DIR`).

## 4. Secrets (api only)

Put these on the **api** service, not the UI or the laptop helper:

| Variable | Why |
| --- | --- |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY` | Real Pi agent. At least one authenticated provider. |
| `BSA_TOKEN` | Power-user escape for `/chat` and `/node`. Not the consumer pair path. |
| `BSA_REGISTER_OPEN` | Default `1` for the first signup. Set to `0` after you create the personal account. |
| `BSA_COOKIE_SECURE=1` | Already in the vibed pack. |

Never set `BSA_NO_PI`. If Pi cannot start, `/healthz` reports `{ ok: true, pi: false, reason }` and chat does **not** answer `"I heard you"`. Register and pair still work.

## 5. First account, then lock signup

1. Open `https://agent.trustless-commerce.com` (no `?token=` in the URL).
2. Create the personal account.
3. Set `BSA_REGISTER_OPEN=0` on api and reload/recreate the api container.

## 6. Pair the laptop helper

In the signed-in UI, click **Pair this computer**. Copy the one-time command (no git checkout):

```bash
curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=<code> bash
```

Windows PowerShell: `curl.exe -fsSL https://agent.trustless-commerce.com/install.ps1 -o $env:TEMP\bsa-install.ps1` then set `BSA_PAIR_CODE` and run the file.

The first run installs portable Node and Playwright Chromium, or uses Docker if the daemon is already up. It stores `{BSA_HOME}/credentials/device.json` (default `~/.browser-session-agent`) and reconnects without `BSA_TOKEN`. A checkout can still use `scripts/run-desktop-node.sh`.

See **Connected** in the header. If the helper is offline, chat still works; browser tools fail with `helper_disconnected`.

## 7. Smoke (your laptop + VPS)

1. Start a goal (`/browser-start` or a prompt that needs the page).
2. Live view shows a JPEG from the helper’s Chromium.
3. Takeover, then resume.
4. Quit the helper → UI shows disconnected; inspect/act fail closed.

Live host smoke is **manual**. `npm test` stays local (fixtures, `BSA_NO_PI` / `BSA_FAKE_PI`, no vendor keys).

## 8. Local HTTP stand-in (optional)

`deploy/docker/compose.vps.yml` (included from `deploy/vibed/docker-compose.yml`) is an HTTP `:8080` stand-in. It does **not** set `BSA_COOKIE_SECURE=1` (Secure cookies would be dropped on HTTP). Production TLS uses the vibed pack.
