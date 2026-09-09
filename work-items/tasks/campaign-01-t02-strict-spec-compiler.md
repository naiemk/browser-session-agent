# CAMPAIGN-01-T02: Strict SpecCompiler

Status: done  
Spec: **SPEC-01** … **SPEC-07**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L0**  
Expected paths: `src/durable/domain/spec-compiler.ts`, `oracles.ts`, golden fixtures

## Goal

Compile drafts to immutable `WorkflowSpecV2` canonical bytes with structured diagnostics.
No silent string→predicate coercion or wildcard grant synthesis at propose/approve.

## Discovery

- Compare prototype `normalizeSpec` coercion paths to SPEC-02 bans.
- List AggregateOracle vs OperationOracle responsibilities.

## Fix

- Schema + canonicalization + hash (SPEC-01)
- Strict diagnostics (SPEC-02)
- Seed template rule (SPEC-04)
- Discoverable case pipeline deps (SPEC-05)
- neverPreapprove completeness (SPEC-06) — typed mapping table for later gate
- Lenient draft feedback vs strict propose (SPEC-07)
- Golden fixtures: valid singleton, discovered, recurring; invalid grants; missing seed

## Prohibited

- Calling browser
- Writing SQLite
- Approving via Pi UI (adapters later)

## Tests

- Round-trip hash stability
- Invalid drafts produce codes, not coerced success
- AggregateOracle required for job completion field

## Review focus

No prototype coercion leaking into approve path; discoverable deps are case-scoped only.

## Depends on

CAMPAIGN-01-T01.

## Done when

SPEC-01..07 L0 evidence; evaluation + improvement pass complete.

## Supersedes

Compiler half of obsolete `campaign-01-t01-domain-spec-compiler.md`.
