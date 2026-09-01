# Helper installer contracts

Unsigned Windows and Mac helper templates. Signed MSI/pkg is a release runbook, not a CI gate.

## Profile paths

- Windows: `%APPDATA%\browser-session-agent`
- macOS: `~/Library/Application Support/browser-session-agent`

Pairing uses the `bsa://` URL scheme. The helper stores a device credential after exchange. **Do not bake `BSA_TOKEN`, a device token, or a private key into these manifests.**

## Chromium

The helper drives Playwright Chromium on the user’s machine. After unpacking a layout, install the browser with:

```
npx playwright install chromium
```

Place Chromium next to the helper or rely on Playwright’s default cache. The hosted API never launches Chromium.

## Files

- `windows/bsa-protocol.reg` — `bsa` protocol handler
- `windows/run-at-login.ps1` — HKCU Run key
- `macos/Info.plist` — `CFBundleURLSchemes` includes `bsa`
- `macos/com.browser-session-agent.helper.plist` — LaunchAgent
