# vibed-infra pack (VPS)

Install **ui + api + gateway** only. The desktop is the node.

```bash
# On the VPS (after vibed-infra is installed)
# wget the vibed-infra installer for this host, then apply:
#   vibed-infra-config.yml
#   api-config.yaml
#   ui-config.yaml
```

Prefer the images CI publishes to GHCR (`browser-session-api`, `browser-session-ui`, `browser-session-node`). Compose files live in `deploy/docker/`.

LLM keys live on `api`. Playwright browsers are only in the **node** image.

On the desktop:

```bash
scripts/run-desktop-node.sh wss://api.example.com/node "$BSA_TOKEN"
```

Do not wget `install-nodes.sh` onto the VPS.
