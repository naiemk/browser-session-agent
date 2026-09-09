# Evaluation: CAMPAIGN-02-T04 (L5 uplift)

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: EXEC-01, EXEC-05
Evidence: L2 real LocalBrowser + L5 contract (ProfileEpochGuard); full Magpie worker CDP reconnect still operator-path

## Discovery

- `WorkerBrowserPort` already adopts/lazy-starts `BrowserWorker`.
- Durable dispatcher used FakeKernel only.

## Changes

- `persistent-host.ts`: create/reattach WorkerBrowserPort helpers + ProfileEpochGuard
- Integration test: due tick via real LocalBrowser fixture; stale tab after epoch bump

## Senior review

| Category | Score |
| --- | --- |
| Correctness | 3 |
| Boundaries | 4 |
| Concurrency | 3 |
| Safety | 3 |
| Observability | 3 |
| Perf/cost | 3 |
| Test realism | 3 |
| Maintainability | 3 |

## Improvement pass

Added epoch guard assertion so reconnect tests fail closed on stale refs rather than only documenting the rule.

## Residual

- P1: Spawned second-process Magpie CDP reconnect not automated here (needs headed worker harness).
