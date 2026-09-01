# V1-07-T02: Installer contracts

Status: done  
Story: V1-07

## Spec

Windows and Mac installer manifests declare `bsa://`, a login item / Run-at-login, and profile paths under AppData / Application Support. Layout contains no baked long-lived secret.

## Possible

Checked-in templates: Windows protocol + Run key (`.reg` or WiX/snippet), Mac `Info.plist` + LaunchAgent plist. Tests are assertions on those files, not a real MSI install.

## Do

- Manifest fixtures under `deploy/helper/` (or similar)
- Document profile paths: `%APPDATA%\browser-session-agent`, `~/Library/Application Support/browser-session-agent`
- Explicit “no secret in installer” grep

## Tests

`tests/e2e/v1-07-installer-contracts.test.ts` (or `tests/unit/helper-manifests.test.ts` if no browser)

- Windows snippet registers `bsa` scheme and a login run entry
- Mac plist `CFBundleURLSchemes` includes `bsa`; LaunchAgent runs the helper
- Profile path strings match the spec
- Manifests and sample layout have no `BSA_TOKEN` / device_token / private key

## Done when

A future installer PR cannot drop `bsa://` or sneak a secret into the templates without CI failing.
