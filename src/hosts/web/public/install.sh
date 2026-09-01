#!/usr/bin/env bash
# Desktop node installer. Safe to pipe — no git checkout required.
#
#   curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=… bash
#
# First run installs Node 22 + Playwright Chromium (or uses Docker if the
# daemon is already up). Later runs reuse ~/.browser-session-agent.
set -euo pipefail

log() { printf 'bsa-install: %s\n' "$*"; }
err() { printf 'bsa-install: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

usage() {
  cat <<'EOF'
Install and start the browser-session desktop node.

  curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=<code> bash

Optional env:
  BSA_PAIR_CODE     one-time code from Pair this computer (first run)
  BSA_API_URL       default wss://agent.trustless-commerce.com/node
  BSA_ORIGIN        https origin used to derive BSA_API_URL
  BSA_HOME          profile + credentials dir (default ~/.browser-session-agent)
  BSA_NATIVE=1      skip Docker even if it is running
  BSA_HEADLESS=0    show a real Chromium window (default is headless + live view)
  BSA_REPO / BSA_REF  source tarball (default GitHub main)
  BSA_NODE_VERSION  portable Node (default 22.19.0)
  BSA_NODE_IMAGE    Docker image if Docker is used
EOF
}

PAIR_CODE="${BSA_PAIR_CODE:-}"
API_URL="${BSA_API_URL:-}"
ORIGIN="${BSA_ORIGIN:-https://agent.trustless-commerce.com}"
HOME_DIR="${BSA_HOME:-${HOME}/.browser-session-agent}"
REPO="${BSA_REPO:-https://github.com/naiemk/browser-session-agent}"
REF="${BSA_REF:-main}"
NODE_VERSION="${BSA_NODE_VERSION:-22.19.0}"
IMAGE="${BSA_NODE_IMAGE:-ghcr.io/naiemk/browser-session-node:latest}"
FORCE_NATIVE="${BSA_NATIVE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --pair-code) PAIR_CODE="${2:-}"; shift 2 ;;
    --api|--url) API_URL="${2:-}"; shift 2 ;;
    --origin) ORIGIN="${2:-}"; shift 2 ;;
    --native) FORCE_NATIVE=1; shift ;;
    --headless) export BSA_HEADLESS=1; shift ;;
    --headed) export BSA_HEADLESS=0; shift ;;
    *)
      [[ "$1" == -* ]] && die "unknown flag: $1 (try --help)"
      PAIR_CODE="${PAIR_CODE:-$1}"
      shift
      ;;
  esac
done

if [[ -z "$API_URL" ]]; then
  origin="${ORIGIN%/}"
  if [[ "$origin" == https://* ]]; then
    API_URL="wss://${origin#https://}/node"
  elif [[ "$origin" == http://* ]]; then
    API_URL="ws://${origin#http://}/node"
  else
    API_URL="wss://agent.trustless-commerce.com/node"
  fi
fi

cred_file="${HOME_DIR}/credentials/device.json"
if [[ -z "$PAIR_CODE" && ! -f "$cred_file" ]]; then
  die "Set BSA_PAIR_CODE from Pair this computer, or reconnect after a successful pair (${cred_file})."
fi

mkdir -p "$HOME_DIR" "$HOME_DIR/runtime" "$HOME_DIR/src"

have() { command -v "$1" >/dev/null 2>&1; }

fetch() {
  local dest="$1" url="$2"
  if have curl; then
    curl -fL --retry 3 --retry-delay 1 -o "$dest" "$url"
  elif have wget; then
    wget -qO "$dest" "$url"
  else
    die "Need curl or wget to download ${url}"
  fi
}

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) node_arch="x64" ;;
  aarch64|arm64) node_arch="arm64" ;;
  armv7l) node_arch="armv7l" ;;
  *) die "unsupported CPU: $arch" ;;
esac

if [[ "$os" == mingw* || "$os" == msys* || "$os" == cygwin* ]]; then
  die "Git Bash/Cygwin is not the installer path. Use Windows PowerShell: curl.exe -fsSL https://agent.trustless-commerce.com/install.ps1 -o \$env:TEMP\\bsa-install.ps1 then run it, or use WSL."
fi
[[ "$os" == linux || "$os" == darwin ]] || die "unsupported OS: $os (use WSL on Windows, or install.ps1)"

docker_ready() {
  [[ -z "$FORCE_NATIVE" ]] && have docker && docker info >/dev/null 2>&1
}

run_docker() {
  log "Docker is running — pulling ${IMAGE}"
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker pull "$IMAGE" || die "Could not pull ${IMAGE}. Set BSA_NATIVE=1 to install without Docker."
  fi
  docker rm -f browser-session-node >/dev/null 2>&1 || true
  log "Starting desktop node → ${API_URL}"
  exec docker run --rm \
    --name browser-session-node \
    --ipc=host \
    --shm-size=1g \
    --add-host=host.docker.internal:host-gateway \
    -e "BSA_API_URL=${API_URL}" \
    -e "BSA_PAIR_CODE=${PAIR_CODE}" \
    -e "BSA_HOME=/data" \
    -e "BSA_HEADLESS=${BSA_HEADLESS:-1}" \
    -v "${HOME_DIR}:/data" \
    "$IMAGE"
}

node_major() {
  have node || return 1
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || return 1
}

ensure_node() {
  local major
  major="$(node_major || true)"
  if [[ -n "${major:-}" && "$major" -ge 22 ]]; then
    log "Using $(command -v node) ($(node -v))"
    return 0
  fi
  local prefix="${HOME_DIR}/runtime/node"
  if [[ -x "${prefix}/bin/node" ]]; then
    export PATH="${prefix}/bin:${PATH}"
    log "Using portable Node $($prefix/bin/node -v)"
    return 0
  fi
  local platform tarball url tmp
  case "$os" in
    linux) platform="linux" ;;
    darwin) platform="darwin" ;;
  esac
  tarball="node-v${NODE_VERSION}-${platform}-${node_arch}.tar.gz"
  url="https://nodejs.org/dist/v${NODE_VERSION}/${tarball}"
  tmp="$(mktemp)"
  log "Installing portable Node v${NODE_VERSION} (${platform}-${node_arch})"
  fetch "$tmp" "$url"
  mkdir -p "${HOME_DIR}/runtime"
  tar -xzf "$tmp" -C "${HOME_DIR}/runtime"
  rm -f "$tmp"
  rm -rf "$prefix"
  mv "${HOME_DIR}/runtime/node-v${NODE_VERSION}-${platform}-${node_arch}" "$prefix"
  export PATH="${prefix}/bin:${PATH}"
  log "Node $($prefix/bin/node -v) ready"
}

ensure_source() {
  if [[ -f "${HOME_DIR}/src/package.json" && "${BSA_REFRESH:-}" != "1" ]]; then
    log "Reusing source in ${HOME_DIR}/src"
    return 0
  fi
  local url tmp parent
  url="${REPO}/archive/refs/heads/${REF}.tar.gz"
  tmp="$(mktemp)"
  log "Downloading ${url}"
  fetch "$tmp" "$url"
  rm -rf "${HOME_DIR}/src"
  mkdir -p "${HOME_DIR}/src"
  tar -xzf "$tmp" -C "${HOME_DIR}/src" --strip-components=1
  rm -f "$tmp"
  [[ -f "${HOME_DIR}/src/package.json" ]] || die "source tarball missing package.json"
  parent="$(awk -F/ '{print $NF}' <<<"$REPO")"
  log "Source unpacked (${parent}@${REF})"
}

ensure_npm_and_browser() {
  cd "${HOME_DIR}/src"
  if [[ ! -d node_modules || "${BSA_REFRESH:-}" == "1" ]]; then
    log "npm install (first run takes a few minutes)"
    if [[ -f package-lock.json ]]; then
      npm ci --omit=dev
      npm install --save-prod tsx@4.23.13
    else
      npm install --omit=dev
      npm install --save-prod tsx@4.23.13
    fi
  fi
  if [[ ! -d "${HOME_DIR}/ms-playwright" && -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]]; then
    export PLAYWRIGHT_BROWSERS_PATH="${HOME_DIR}/ms-playwright"
  fi
  export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${HOME_DIR}/ms-playwright}"
  log "Installing Playwright Chromium"
  npx playwright install chromium
  if [[ "$os" == linux ]] && have sudo && sudo -n true >/dev/null 2>&1; then
    log "Installing Chromium system libraries (sudo)"
    sudo -n npx playwright install-deps chromium || true
  fi
}

write_launcher() {
  local bin="${HOME}/.local/bin"
  mkdir -p "$bin"
  cat > "${bin}/browser-session-node" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PATH="${HOME_DIR}/runtime/node/bin:\${PATH}"
export BSA_HOME="${HOME_DIR}"
export BSA_API_URL="\${BSA_API_URL:-${API_URL}}"
export PLAYWRIGHT_BROWSERS_PATH="\${PLAYWRIGHT_BROWSERS_PATH:-${HOME_DIR}/ms-playwright}"
cd "${HOME_DIR}/src"
exec node --import tsx src/hosts/node-agent/cli.ts --api "\$BSA_API_URL" "\$@"
EOF
  chmod +x "${bin}/browser-session-node"
  log "Launcher: ${bin}/browser-session-node  (add ${bin} to PATH if needed)"
}

run_native() {
  ensure_node
  ensure_source
  ensure_npm_and_browser
  write_launcher
  export BSA_HOME="$HOME_DIR"
  export BSA_API_URL="$API_URL"
  export BSA_PAIR_CODE="${PAIR_CODE:-}"
  export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${HOME_DIR}/ms-playwright}"
  export PATH="${HOME_DIR}/runtime/node/bin:${PATH}"
  cd "${HOME_DIR}/src"
  log "Starting desktop node → ${API_URL}"
  exec node --import tsx src/hosts/node-agent/cli.ts --api "$API_URL"
}

if docker_ready; then
  run_docker
else
  if have docker && [[ -z "$FORCE_NATIVE" ]]; then
    log "Docker CLI found but the daemon is not running — installing a native node instead."
  fi
  run_native
fi
