# CAMPAIGN-02-T04: Persistent execution host and DirectKernel

Status: done  
Spec: **EXEC-01**, **EXEC-05**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L5** (required), **L4** cancel/lease integration  
Expected paths: `src/durable/adapters/` host wiring, DirectKernel using WorkerBrowserPort

## Goal

Execute one claimed attempt through Magpie’s persistent browser + model port. No ephemeral
Playwright for durable work except explicit development flag (owned by CAMPAIGN-00).

## Fix

- ExecutionHost wiring (model, persistent BrowserPort, cancel, clock, metrics, profileKey)
- DirectKernel → existing WorkerBrowserPort / node-agent RPC
- Full dispatcher loop with 02-T02 leases and 02-T03 context/evaluator
- runtime_unavailable when attach fails

## Tests

- Spawned process executes due fixture via persistent port
- Restart control process; same profile auth on fixture
- Stale tab/ref rejected after restart

## Depends on

CAMPAIGN-02-T02, CAMPAIGN-02-T03.

## Done when

EXEC-01/05 at L5; evaluation + improvement pass.

## Supersedes

Host portion of obsolete `campaign-02-t02-execution-host.md`.
