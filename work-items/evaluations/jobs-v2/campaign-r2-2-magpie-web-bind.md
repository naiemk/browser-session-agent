# Evaluation: CAMPAIGN-R2-2 (Magpie / hosted durable bind)

Date: 2026-09-11
Implementer: Auto (Composer)
Spec IDs: ADAPTER-01, ADAPTER-02, ADAPTER-03, ADAPTER-04, SCHED-02
Evidence: L6 (FakePi Magpie bind + hosted command dispatch). Do not claim L5/L7.
Commit: (this PR)

## Discovery

- R2.1 landed `registerDurablePiCommands` and `createProductExecutionHost`, but Magpie
  chat still only bound prototype `/job-*` via `bindJobCommands`.
- Hosted `OperatorRuntime` had coach/plan but no durable commands; `app.js` COMMANDS
  omitted them.
- Pi adapter remediation used `detail ?? remediation`, so the dispatcher’s hardcoded
  CLI `--host` sentence always won over Magpie/hosted copy.
- CLI `durable/magpie-host` isolation must not be reused in Magpie chat (chat already
  holds the interactive profile).

## Implementation summary

- `src/host/pi-durable.ts` — `bindDurableCommands`, `magpieDurableHostFactory`,
  `warmCreateLiveModel` (skipped under `NODE_TEST_CONTEXT`).
- Magpie: `hostFactory` uses `session.worker` when `workerInfo` is set + cached
  `createLiveModel`; profile key `magpie-chat`; no `worker.start()` from status.
- Hosted: `hostFactory` always `() => null`; remediation points at Magpie TUI / CLI
  `--host`.
- Pi adapter: `remediation: string | (() => string)` and overlay prefers surface copy.
- `app.js`: `durable-status` / `durable-tick` / `durable-cancel` with job-id prompts.

## Initial evidence

```bash
npx tsx --test tests/unit/pi-durable.test.ts tests/unit/durable-product-host.test.ts
```

7 pass / 0 fail.

Highest evidence level claimed: **L6**.

Non-evidence avoided: no L7 live job; no CDP reconnect; no `createLiveModel` in unit
tests; did not claim R2 shipped / R2.E1 / R2.E3 / R2.4 / AGENT-16-T04 / R1.E2.

## Spec validation

| Requirement | Status |
| --- | --- |
| ADAPTER-01 Pi commands | Pass (Magpie + hosted register) |
| ADAPTER-02 no claim of running without host | Pass (runtime_unavailable + remediation) |
| ADAPTER-03 fresh chat does not bind a job | Pass (`durableChatBinding().boundJobId` undefined) |
| ADAPTER-04 construct host or runtime_unavailable | Pass (factory null / Magpie host) |
| SCHED-02 missing host ≠ idle | Pass (FakePi null-host tick) |
| Prototype `/job-*` remains | Pass |
| FakeKernel not imported on bind surfaces | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Prefer surface remediation over dispatcher CLI copy |
| Boundaries | 4 | 4 | Hosted fail-closed; no RpcSessionHandle-as-worker |
| Concurrency / crash | 3 | 3 | No auto-tick / no surprise Chrome |
| Safety / privacy | 3 | 4 | Same Chrome as chat; no second durable/magpie-host |
| Observability | 3 | 4 | Magpie vs hosted vs no-model remediation |
| Perf/cost | 3 | 3 | Warm model once; skipped in tests |
| Test realism | 3 | 4 | FakePi Magpie + hosted + app.js string |
| Maintainability | 3 | 4 | Thin `pi-durable.ts`; logic stays in adapter |

Residual (P1): Hosted/RPC ExecutionHost twin (ticks remain fail-closed).
Residual (P1): R2.E1 Magpie CDP reconnect.
Residual (P2): R2.E3 L7 smokes before R2.4 delete.

## Improvement pass

- Overlay Pi `runtime_unavailable` detail with surface remediation instead of
  `detail ?? remediation` (dispatcher CLI string otherwise stuck).
- Skip `createLiveModel` warm under `NODE_TEST_CONTEXT`.
- Keep prototype `/job-*` labeled and registered (no silent cutover).

## Requirement coverage

ADAPTER-01..04, SCHED-02 → `src/host/pi-durable.ts`, `extension.ts`,
`hosts/web/runtime.ts`, `hosts/web/public/app.js`, `tests/unit/pi-durable.test.ts`.

## Open risks / follow-ups

- R2.E1 Magpie CDP reconnect
- R2.E3 L7 smokes
- Hosted/RPC ExecutionHost twin
- Magpie laptop SQLite and hosted API SQLite remain different `coreRoot()` processes
