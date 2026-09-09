# Evaluation: AGENT-12-T01

Date: 2026-09-09
Implementer: Auto (Composer)
Spec: Node 24 + Pi 0.85.1 lockstep; no Fabric

## Discovery

- Local runtime already Node 24.1.0; CI/Docker/installers were Node 22.
- Latest Pi packages: 0.85.1 for agent-core, pi-ai, pi-coding-agent.
- Jobs V2 `node:sqlite` requires Node 24-class runtime in CI.

## Changes

- `package.json` engines `>=24`; Pi deps `^0.85.1`; `@types/node` `^24`
- CI / baseline / release workflows → Node 24
- Dockerfiles api/node/vibed → `node:24-*`
- Portable installers default `24.1.0`
- Job harness sets `BSA_JOB_PROTOTYPE_DEV=1` so grant e2e still works under MIGRATE-01 strip

## Senior review

| Area | Score | Notes |
| --- | --- | --- |
| Correctness | 3 | Surfaces aligned; Pi upgrade may need follow-up if API drift appears |
| Boundaries | 4 | No Fabric; upgrade-only |
| Concurrency | 3 | n/a |
| Safety | 3 | grant strip preserved; tests opt into DEV |
| Observability | 3 | version assertions |
| Perf/cost | 3 | n/a |
| Test realism | 3 | unit asserts + grant regression |
| Maintainability | 3 | |

## Improvement pass

Added `tests/unit/agent-12-node24.test.ts` so Node 22 cannot silently return in CI/install defaults.

## Residual risks

- P1: Full precommit after Pi 0.85.1 not yet green in this commit message — run before merge
- P2: Mixed transitive `@mariozechner/pi-ai` deprecation warning remains from other deps
