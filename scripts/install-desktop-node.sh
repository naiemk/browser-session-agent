#!/usr/bin/env bash
# Native (non-Docker) desktop node. Prefer scripts/run-desktop-node.sh when Docker is available.
# Do not run this on the VPS.
set -euo pipefail

if command -v docker >/dev/null 2>&1 && [[ "${BSA_NATIVE:-}" != "1" ]]; then
  echo "Docker found — using scripts/run-desktop-node.sh (set BSA_NATIVE=1 to force npm)."
  exec "$(cd "$(dirname "$0")" && pwd)/run-desktop-node.sh" "$@"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${1:-${BSA_API_URL:-}}"
TOKEN="${2:-${BSA_TOKEN:-}}"

if [[ -z "$API_URL" ]]; then
  echo "Usage: scripts/install-desktop-node.sh wss://api.example.com/node <token>" >&2
  exit 1
fi

cd "$ROOT"
npm install
npx playwright install chromium

BIN="$HOME/.local/bin"
mkdir -p "$BIN"
cat > "$BIN/browser-session-node" <<EOF
#!/usr/bin/env bash
export BSA_API_URL="${API_URL}"
export BSA_TOKEN="${TOKEN}"
exec node --import tsx "$ROOT/src/hosts/node-agent/cli.ts" --api "\$BSA_API_URL" --token "\$BSA_TOKEN" "\$@"
EOF
chmod +x "$BIN/browser-session-node"

UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
if command -v systemctl >/dev/null 2>&1; then
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/browser-session-node.service" <<EOF
[Unit]
Description=Browser session desktop node
After=network-online.target

[Service]
Type=simple
Environment=BSA_API_URL=${API_URL}
Environment=BSA_TOKEN=${TOKEN}
ExecStart=${BIN}/browser-session-node
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  echo "Enable with: systemctl --user enable --now browser-session-node"
fi

echo "Installed browser-session-node → $API_URL"
echo "Profile stays at ~/.browser-session-agent/profile (or BSA_HOME)."
echo "Do not expose Chromium's CDP port. The node only makes an outbound WebSocket."
