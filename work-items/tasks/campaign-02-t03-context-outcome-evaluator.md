# CAMPAIGN-02-T03: Context compiler, outcomes, evaluator

Status: done  
Spec: **EXEC-04**, **EXEC-06** (port only), **EXEC-07**, **EXEC-09**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L0**, **L2**  
Expected paths: `src/durable/application/context-compiler.ts`, `outcome.ts`,
`evaluator.ts`, `ports/execution-kernel.ts`

## Goal

Fresh bounded CompiledAttempt; typed OperationOutcome; separate retry families; oracle
evaluation not model claim. Define ExecutionKernel port (Fabric implements later).

## Fix

- ContextCompiler contents per EXEC-04 (no transcript/sprint authority)
- OperationOutcome / BlockReason / FailureStage / Checkpoint (no DOM refs)
- Retry family counters + new-evidence rule (EXEC-07 / PERF-13)
- OutcomeEvaluator uses oracles + evidence (EXEC-09 / QUAL-03)
- ExecutionKernel interface; Direct stub or fake for tests; Fabric out of scope here

## Tests

- Context payload schema fixtures
- Identical retry without new evidence rejected
- Fake success claim does not pass oracle

## Depends on

CAMPAIGN-01-T02, CAMPAIGN-02-T01.

## Done when

Cited EXEC IDs evidenced; evaluation + improvement pass.

## Supersedes

Context/outcome portion of obsolete `campaign-02-t02-execution-host.md`.
