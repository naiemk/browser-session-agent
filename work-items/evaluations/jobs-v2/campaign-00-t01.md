# Evaluation: CAMPAIGN-00-T01

Date: 2026-09-09
Implementer: Auto (Composer)
Spec IDs: MIGRATE-01, ADAPTER-02
Evidence level claimed: L6 (CLI process + Pi message purity tests)

## Discovery notes

- `tick()` returned `{ status: "idle", detail: "no runtime attached" }` when work was
  eligible but no model/browser host was attached (`src/jobs/runner.ts`).
- CLI HELP claimed `job tick --due is safe for cron/launchd`.
- `job run` always launched ephemeral Playwright without an opt-in flag.
- `JobService.revise` allowed new drafts after materialization.
- Pi copy claimed “scheduled step” / “scheduler tick” for approved jobs.
- `active-job` session entry was write-only and never restored.
- Prototype grants were passed to the gate; `neverPreapprove` not independently enforced.
- Baseline tests encoded idle-for-missing-runtime (`job-lease-and-budget.test.ts`).

## Changes

- `TickStatus` + runner: `runtime_unavailable` when eligible work lacks host.
- CLI: exit 4 + stderr for that case; HELP experimental; remove cron safety claim;
  require `--allow-ephemeral` for `job run` with warning.
- `JobService.revise`: reject after plan materialization (`revision_blocked`).
- Pi: honest resume/approve/run/revise copy; rename evidence entry to
  `job-session-evidence` (non-restorable).
- Grants: `buildPrototypeGateGrants` returns `[]` unless `BSA_JOB_PROTOTYPE_DEV=1`.

## Commands run

```bash
npx tsx --test --test-concurrency=1 --test-timeout=120000 \
  tests/unit/durable-domain.test.ts \
  tests/unit/durable-boundary.test.ts \
  tests/e2e/job-quarantine.test.ts \
  tests/e2e/job-lease-and-budget.test.ts \
  tests/e2e/job-cli-smoke.test.ts
npm run typecheck
```

Evidence file: `results/jobs-v2/campaign-00-t01/targeted-tests.txt` (27 pass).

## Senior review (fresh context)

| Area | Notes |
| --- | --- |
| Correctness | Missing-host path no longer labeled idle; CLI nonzero; revise blocked; ephemeral gated. |
| Boundaries | Quarantine stays in `src/jobs` / adapters; no SQLite dual-write. |
| Concurrency | Unchanged lease behavior; stolen expired lease now correctly reports unavailable. |
| Safety | Grants stripped outside DEV; neverPreapprove still not enforced (documented). |
| Observability | Status string + stderr joinable; Pi messaging aligned. |
| Perf/cost | N/A beyond avoiding false cron use. |
| Test realism | L6 via CLI `main()` capture + Pi pure string export; not FakePi full session. |
| Maintainability | Small surface; exported grant helper for tests. |

Residual risks:

- P1: Full FakePi session binding not exercised (string-level ADAPTER-02 only).
- P1: `neverPreapprove` still not independently enforced at the gate (explicitly out of
  deep fix; documented).
- P2: `tickDue` still stops after first `busy` (SCHED-08 is later ticket).

## Scorecard

| Category | Initial | After improvement | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | stderr + grant strip evidenced |
| Architectural boundaries | 3 | 3 | quarantine-only |
| Concurrency / crash | 2 | 2 | out of scope; lease path still green |
| Safety / privacy | 3 | 4 | grants gated by DEV flag + test |
| Observability | 2 | 3 | CLI stderr on unavailable |
| Performance / cost | 3 | 3 | cron claim removed |
| Test realism | 3 | 3 | L6 CLI; Pi string-level |
| Maintainability | 3 | 3 | |

Hard gates: met after improvement (correctness/safety/test realism ≥ 3; none &lt; 2).

## Improvement pass

- Added CLI stderr explaining “not idle”.
- Exported `buildPrototypeGateGrants` and tested empty vs DEV=1.
- Strengthened quarantine suite.

## Requirement coverage

| ID | Code | Test | Evidence |
| --- | --- | --- | --- |
| MIGRATE-01 | runner/service/cli/pi-jobs | job-quarantine, lease, cli-smoke | targeted-tests.txt |
| ADAPTER-02 | pi-jobs `userFacingJobResume`, HELP | job-quarantine Pi + HELP cases | targeted-tests.txt |

## Open risks / follow-ups

- CAMPAIGN-04-T01 for full FakePi adapter contract.
- AGENT-14 for real neverPreapprove enforcement.
- Do not cron `job tick --due` until V2 ExecutionHost exists.
