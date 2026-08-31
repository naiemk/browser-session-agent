# MVP-02-T01: Persistent Chromium worker

Status: done  
Story: MVP-02  
Depends: MVP-01-T01

## Spec

A Playwright worker launches one dedicated Chromium user-data-dir, writes a CDP endpoint to `worker.json`, and reconnects after the Node client restarts.

## Possible

`chromium.launchPersistentContext` persists cookies. `--remote-debugging-port` plus `connectOverCDP` reattaches while Chromium is still running. A second `launchPersistentContext` on a locked profile fails — reconnect first, relaunch only if CDP is dead.

## Do

- `BrowserWorker.start({ headless, profileDir, port })`
- Cookie-preserving relaunch (new client, same profile)
- CDP reconnect path from `worker.json`
- `/browser-stop` closes Chromium; default Pi shutdown does not

## Tests

- Headless: set a cookie on the fixture origin, close worker client, start again with same profile, cookie still present
- Write `worker.json`, start a second worker with reconnect=true against a live browser, inspect succeeds without a second profile lock failure

## Done when

Playwright reconnects to the dedicated profile in CI (headless) using the same APIs as headed mode.
