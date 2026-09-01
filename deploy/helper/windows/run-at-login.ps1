# Run the Browser Session Agent helper at login.
# Profile directory: %APPDATA%\browser-session-agent
# Do not bake BSA_TOKEN, device tokens, or private keys into this snippet.

$ErrorActionPreference = "Stop"
$exe = Join-Path $env:LOCALAPPDATA "browser-session-agent\browser-session-node.exe"
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $runKey -Name "BrowserSessionAgent" -PropertyType String -Value "`"$exe`"" -Force | Out-Null
Write-Host "Registered Run-at-login for $exe"
