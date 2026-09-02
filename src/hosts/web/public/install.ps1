# Desktop node installer for Windows PowerShell. No git checkout required.
#
#   curl.exe -fsSL https://agent.trustless-commerce.com/install.ps1 -o $env:TEMP\bsa-install.ps1
#   $env:BSA_PAIR_CODE = '<code>'
#   powershell -ExecutionPolicy Bypass -File $env:TEMP\bsa-install.ps1
#
# First run installs portable Node 22 + Playwright Chromium (or uses Docker
# Desktop if `docker info` works). Later runs reuse %APPDATA%\browser-session-agent.
$ErrorActionPreference = "Stop"

function Write-Log([string]$Message) { Write-Host "bsa-install: $Message" }

$PairCode = $env:BSA_PAIR_CODE
$ApiUrl = $env:BSA_API_URL
$Origin = $(if ($env:BSA_ORIGIN) { $env:BSA_ORIGIN } else { "https://agent.trustless-commerce.com" })
$HomeDir = $(if ($env:BSA_HOME) { $env:BSA_HOME } else { Join-Path $env:APPDATA "browser-session-agent" })
$Repo = $(if ($env:BSA_REPO) { $env:BSA_REPO } else { "https://github.com/naiemk/browser-session-agent" })
$Ref = $(if ($env:BSA_REF) { $env:BSA_REF } else { "main" })
$NodeVersion = $(if ($env:BSA_NODE_VERSION) { $env:BSA_NODE_VERSION } else { "22.19.0" })
$Image = $(if ($env:BSA_NODE_IMAGE) { $env:BSA_NODE_IMAGE } else { "ghcr.io/naiemk/browser-session-node:latest" })
$ForceNative = $env:BSA_NATIVE -eq "1"

if (-not $ApiUrl) {
  $origin = $Origin.TrimEnd("/")
  if ($origin.StartsWith("https://")) { $ApiUrl = "wss://" + $origin.Substring(8) + "/node" }
  elseif ($origin.StartsWith("http://")) { $ApiUrl = "ws://" + $origin.Substring(7) + "/node" }
  else { $ApiUrl = "wss://agent.trustless-commerce.com/node" }
}

$credFile = Join-Path $HomeDir "credentials\device.json"
if (-not $PairCode -and -not (Test-Path $credFile)) {
  throw "Set BSA_PAIR_CODE from Pair this computer, or reconnect after a successful pair ($credFile)."
}

New-Item -ItemType Directory -Force -Path $HomeDir, (Join-Path $HomeDir "runtime"), (Join-Path $HomeDir "src") | Out-Null

function Test-DockerReady {
  if ($ForceNative) { return $false }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  docker info 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Install-PortableNode {
  $prefix = Join-Path $HomeDir "runtime\node"
  $nodeExe = Join-Path $prefix "node.exe"
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $major = [int](((node -v).TrimStart("v") -split "\.")[0])
    if ($major -ge 22) {
      Write-Log "Using $((Get-Command node).Source) ($(node -v))"
      return
    }
  }
  if (Test-Path $nodeExe) {
    $env:PATH = "$prefix;$env:PATH"
    Write-Log "Using portable Node $(& $nodeExe -v)"
    return
  }
  $zipName = "node-v$NodeVersion-win-x64.zip"
  $url = "https://nodejs.org/dist/v$NodeVersion/$zipName"
  $zip = Join-Path $env:TEMP $zipName
  Write-Log "Installing portable Node v$NodeVersion"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
  $extract = Join-Path $HomeDir "runtime"
  if (Test-Path $prefix) { Remove-Item -Recurse -Force $prefix }
  Expand-Archive -Force -Path $zip -DestinationPath $extract
  Rename-Item (Join-Path $extract "node-v$NodeVersion-win-x64") "node"
  Remove-Item $zip -Force
  $env:PATH = "$prefix;$env:PATH"
  Write-Log "Node $(& $nodeExe -v) ready"
}

function Install-Source {
  $pkg = Join-Path $HomeDir "src\package.json"
  if ((Test-Path $pkg) -and $env:BSA_REFRESH -ne "1") {
    Write-Log "Reusing source in $(Join-Path $HomeDir 'src')"
    return
  }
  $zip = Join-Path $env:TEMP "bsa-src.zip"
  $url = "$Repo/archive/refs/heads/$Ref.zip"
  Write-Log "Downloading $url"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
  $unpack = Join-Path $env:TEMP "bsa-src"
  if (Test-Path $unpack) { Remove-Item -Recurse -Force $unpack }
  Expand-Archive -Force -Path $zip -DestinationPath $unpack
  $inner = Get-ChildItem $unpack | Select-Object -First 1
  $src = Join-Path $HomeDir "src"
  if (Test-Path $src) { Remove-Item -Recurse -Force $src }
  Move-Item $inner.FullName $src
  Remove-Item $zip, $unpack -Recurse -Force
}

function Install-NpmAndBrowser {
  Push-Location (Join-Path $HomeDir "src")
  try {
    if (-not (Test-Path "node_modules") -or $env:BSA_REFRESH -eq "1") {
      Write-Log "npm install (first run takes a few minutes)"
      if (Test-Path "package-lock.json") {
        npm ci --omit=dev
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
        npm install --save-prod tsx@4.23.13
      } else {
        npm install --omit=dev
        npm install --save-prod tsx@4.23.13
      }
    }
    if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
      $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $HomeDir "ms-playwright"
    }
    Write-Log "Installing Playwright Chromium"
    npx playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw "playwright install failed" }
  } finally {
    Pop-Location
  }
}

$usedDocker = $false
if (Test-DockerReady) {
  Write-Log "Docker is running — pulling $Image"
  docker image inspect $Image 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    docker pull $Image
    if ($LASTEXITCODE -ne 0) {
      Write-Log "Could not pull $Image (often no linux/arm64 manifest). Installing a native node instead."
    } else {
      $usedDocker = $true
    }
  } else {
    $usedDocker = $true
  }
  if ($usedDocker) {
    docker rm -f browser-session-node 2>$null | Out-Null
    Write-Log "Starting desktop node → $ApiUrl"
    $headless = $(if ($env:BSA_HEADLESS) { $env:BSA_HEADLESS } else { "1" })
    docker run --rm --name browser-session-node --ipc=host --shm-size=1g `
      -e "BSA_API_URL=$ApiUrl" `
      -e "BSA_PAIR_CODE=$PairCode" `
      -e "BSA_HOME=/data" `
      -e "BSA_HEADLESS=$headless" `
      -v "${HomeDir}:/data" `
      $Image
    exit $LASTEXITCODE
  }
}

Install-PortableNode
Install-Source
Install-NpmAndBrowser

$env:BSA_HOME = $HomeDir
$env:BSA_API_URL = $ApiUrl
if ($PairCode) { $env:BSA_PAIR_CODE = $PairCode }
if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $HomeDir "ms-playwright"
}
$nodeRoot = Join-Path $HomeDir "runtime\node"
if (Test-Path (Join-Path $nodeRoot "node.exe")) {
  $env:PATH = "$nodeRoot;$env:PATH"
}

Write-Log "Starting desktop node → $ApiUrl"
Set-Location (Join-Path $HomeDir "src")
node --import tsx src/hosts/node-agent/cli.ts --api $ApiUrl
exit $LASTEXITCODE
