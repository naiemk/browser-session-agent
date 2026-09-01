# V1-07-T03: CI unsigned artifacts

Status: planned  
Story: V1-07  
Depends: V1-07-T02

## Spec

CI builds Windows and Mac helper layouts (or archives). The artifact contains the node agent entry and Chromium placement notes. This is not a signed MSI/pkg.

## Possible

GitHub Actions job that packs `browser-session-node` + a README for Playwright Chromium path. Unsigned zip is enough. Signing/notarizing is a release runbook, not this task’s gate.

## Do

- Workflow job on `main` / tags (and PRs as unsigned smoke)
- Layout: helper entrypoint, Chromium path or install script, manifests from T02
- Do not upload secrets

## Tests

`tests/e2e/v1-07-artifact-layout.test.ts` and/or CI step that unpacks the archive

- Archive contains the node agent entry (`bin/browser-session-node` or equivalent)
- README or layout mentions Playwright Chromium placement
- Archive has no `.env` with tokens

## Done when

PRs can prove a helper layout exists without claiming the installer is signed.
