# vibed-infra pack (VPS)

Operator-complete pack for **https://agent.trustless-commerce.com**. Step-by-step: [`docs/pre-v1-runbook.md`](../../docs/pre-v1-runbook.md).

Install **ui + api + gateway** only. Chromium runs on the laptop helper, not on this box.

```bash
# On the VPS (after vibed-infra is installed), apply:
#   vibed-infra-config.yml
#   api-config.yaml
#   ui-config.yaml
# Do not wget install-nodes.sh. Do not add a nodes role.
```

Images: `ghcr.io/naiemk/browser-session-api:latest` and `ghcr.io/naiemk/browser-session-ui:latest`. `:latest` publishes from `main` only (`.github/workflows/docker.yml`). Until merge, build from this branch or pin a sha / `pr-*` tag.

API env (llm keys on **api** only):

- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY`
- `BSA_TOKEN` (power-user escape)
- `BSA_COOKIE_SECURE=1`
- `BSA_REGISTER_OPEN` default `1`; set `0` after the personal signup
- Persist `/var/lib/browser-session` → `/data`
- **Never** set `BSA_NO_PI`

Inner nginx passes `X-Forwarded-Proto` from the TLS terminator (fallback `https`). Cookie `Secure` is also forced by `BSA_COOKIE_SECURE`.

On the laptop, after **Pair this computer** in the signed-in UI:

```bash
wget -qO- https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=<code> bash
```

`BSA_TOKEN` is not required for the helper. Credentials land in `~/.browser-session-agent/credentials/device.json`.
