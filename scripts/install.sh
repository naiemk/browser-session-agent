#!/usr/bin/env bash
# Repo checkout wrapper. The consumer path does not need this folder:
#   curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=… bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/src/hosts/web/public/install.sh" "$@"
