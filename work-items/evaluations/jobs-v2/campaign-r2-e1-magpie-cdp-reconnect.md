# Evaluation: CAMPAIGN-R2-E1 (Magpie CDP reconnect L5)

Date: 2026-09-11
Implementer: Auto (Composer)
Spec IDs: EXEC-05
Evidence: L5 (fixture profile + control-client reconnect). Do not claim L7.
Commit: (this PR)

## Discovery

- `BrowserWorker.start()` already preferred `connectOverCDP` from `worker.json`, but
  launch used Playwright `launchPersistentContext`, which owns Chromium. Closing that
  client killed the browser, so Magpie could not drop a control client and reattach.
- `disconnect()` only cleared state when `!launchedHere`, had zero production callers,
  and used private `_connection.close()`, which leaves `/json/version` up but rejects
  later `connectOverCDP`.
- CAMPAIGN-02-T04 L5 uplift only proved `ProfileEpochGuard` + LocalBrowser; Magpie CDP
  second-client reconnect remained residual.
- Cookie restore after `stop()` is non-evidence for L5 (browser killed + relaunch).

## Implementation summary

- `launchManaged`: spawn Chromium/Chrome detached with `--user-data-dir` +
  `--remote-debugging-port`, then `connectOverCDP` (Playwright is a client only).
- `disconnect()`: `browser.close()` (CDP client drop); leave Chromium + `worker.json`.
- `stop()`: SIGTERM then process-group SIGKILL so the profile flushes and helpers die.
- `tests/integration/magpie-cdp-reconnect-l5.test.ts`: fixture login → disconnect →
  second worker attach → `/jobs` still auth; stale ref / unknown tab fail closed.

## Initial evidence

```bash
npx tsx --test tests/integration/magpie-cdp-reconnect-l5.test.ts
npx tsx --test tests/integration/browser-loop.test.ts tests/e2e/host-worker-port.test.ts
```

22 pass / 0 fail on worker-related suite (includes L5 + cookie restore + host port).

Highest evidence level claimed: **L5**.

Non-evidence avoided: same-process port retention; L7 live smokes; FakeKernel;
`createLiveModel`.

## Spec validation

| Requirement | Status |
| --- | --- |
| EXEC-05 Magpie WorkerBrowserPort reattach after control-client drop | Pass (L5) |
| Same auth on fixture profile | Pass |
| Stale tab/ref rejected | Pass (`missing_tab` / `missing_ref`) |
| disconnect ≠ stop | Pass (CDP `/json/version` + pid alive) |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 2 | 4 | First disconnect used `_connection.close` and broke reconnect; fixed to `browser.close` |
| Boundaries | 3 | 4 | No FakeKernel / model; fixture only |
| Concurrency / crash | 2 | 3 | Detached spawn + group kill; Pi-crash orphan still P1 |
| Safety / privacy | 3 | 3 | Fixture credentials only |
| Observability | 3 | 3 | worker.json pid/cdpUrl retained across disconnect |
| Perf/cost | 3 | 3 | No provider |
| Test realism | 2 | 4 | Real Magpie worker CDP path, not LocalBrowser stand-in |
| Maintainability | 3 | 3 | Launch path change is localized |

Residual (P1): Pi/Node crash still may leave or kill Chromium depending on OS; no
supervisor. Residual (P2): R2.E3 L7 smokes.

## Improvement pass

1. Switched launch from `launchPersistentContext` to detached OS spawn + CDP attach so
   disconnect can leave Chromium alive (required for honest L5).
2. Replaced `_connection.close()` with `browser.close()` after proving the private close
   path rejects later `connectOverCDP`.
3. `stop()` SIGTERM-then-SIGKILL (and process-group kill) so cookie restore after relaunch
   still passes.

## Requirement coverage

EXEC-05 → `src/worker/browser-worker.ts`, `tests/integration/magpie-cdp-reconnect-l5.test.ts`.

## Open risks / follow-ups

- P1: Dedicated supervisor / always-orphan Chrome on Magpie exit still later
- R2.E3 L7 smokes still open
- Hosted/RPC twin still open (orthogonal)
