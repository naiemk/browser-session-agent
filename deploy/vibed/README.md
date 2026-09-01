# vibed-infra pack (VPS)

Install **ui + api + gateway** only. The desktop is the node.

```bash
# On the VPS (after vibed-infra is installed)
# wget the vibed-infra installer for this host, then apply:
#   vibed-infra-config.yml
#   api-config.yaml
#   ui-config.yaml
```

`docker-compose.yml` is a local stand-in. It does not launch Chrome.

LLM keys live on `api`. Playwright is not in `Dockerfile.api`.

On the desktop, run `scripts/install-desktop-node.sh wss://api.example.com/node $BSA_TOKEN`.
Do not wget `install-nodes.sh` onto the VPS.
