# CAMPAIGN-02-T04: Persistent execution host and DirectKernel

Status: done  
Spec: **EXEC-01**, **EXEC-05**  
Evaluation: [`work-items/evaluations/jobs-v2/campaign-02-t04-l5-uplift.md`](../evaluations/jobs-v2/campaign-02-t04-l5-uplift.md)  
Evidence minimum: **L5** (required), **L4** cancel/lease integration  
Expected paths: `src/durable/infrastructure/persistent-host.ts`, DirectKernel + WorkerBrowserPort

## Goal

Execute one claimed attempt through Magpie’s persistent browser + model port. No ephemeral
Playwright for durable work except explicit development flag (owned by CAMPAIGN-00).

## Fix

- `persistent-host.ts`: create/reattach WorkerBrowserPort + ProfileEpochGuard
- DirectKernel host factory for Magpie worker attach
- Integration: LocalBrowser due tick + stale-tab after reconnect epoch

## Tests

- Due fixture via real BrowserPort (LocalBrowser stand-in for persistent profile contract)
- Stale tab/ref rejected after epoch bump
- Residual: full Magpie CDP second-process reconnect remains operator-path

## Depends on

CAMPAIGN-02-T02, CAMPAIGN-02-T03.

## Done when

EXEC-01/05 at L5 contract; evaluation + improvement pass.

## Supersedes

Host portion of obsolete `campaign-02-t02-execution-host.md`.
