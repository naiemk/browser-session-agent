#!/usr/bin/env bash
# Pull (or build) the desktop node image and run it.
# Pair with a one-time code or a stored device token under BSA_HOME. BSA_TOKEN is optional.
# Usage:
# Consumer machines without this repo:
#   wget -qO- https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=… bash
#   BSA_PAIR_CODE=abc123 scripts/run-desktop-node.sh wss://agent.trustless-commerce.com/node
#   scripts/run-desktop-node.sh wss://agent.trustless-commerce.com/node
#   BSA_API_URL=ws://host.docker.internal:8787/node scripts/run-desktop-node.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${1:-${BSA_API_URL:-}}"
TOKEN="${2:-${BSA_TOKEN:-}}"
PAIR_CODE="${BSA_PAIR_CODE:-}"
IMAGE="${BSA_NODE_IMAGE:-ghcr.io/naiemk/browser-session-node:latest}"
DATA="${BSA_DATA:-$HOME/.browser-session-agent}"

if [[ -z "$API_URL" ]]; then
  echo "Usage: scripts/run-desktop-node.sh wss://agent.trustless-commerce.com/node" >&2
  echo "Pair first with BSA_PAIR_CODE=... or reuse the device token in $DATA." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop, then re-run." >&2
  exit 1
fi

mkdir -p "$DATA"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Pulling $IMAGE …"
  if ! docker pull "$IMAGE"; then
    echo "GHCR image not available yet; building locally."
    docker build -t "$IMAGE" -f "$ROOT/deploy/docker/Dockerfile.node" "$ROOT"
  fi
fi

echo "Starting desktop node → $API_URL (profile $DATA)"
exec docker run --rm \
  --name browser-session-node \
  --ipc=host \
  --shm-size=1g \
  --add-host=host.docker.internal:host-gateway \
  -e "BSA_API_URL=$API_URL" \
  -e "BSA_TOKEN=$TOKEN" \
  -e "BSA_PAIR_CODE=$PAIR_CODE" \
  -e "BSA_HOME=/data" \
  -e "BSA_HEADLESS=${BSA_HEADLESS:-1}" \
  -v "$DATA:/data" \
  "$IMAGE"
