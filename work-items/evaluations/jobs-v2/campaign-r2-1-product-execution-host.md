# Evaluation: CAMPAIGN-R2-1 (product ExecutionHost)

Date: 2026-09-10
Implementer: Auto (Composer)
Spec IDs: EXEC-05, ADAPTER-02, ADAPTER-04, SCHED-02
Evidence: L6 FakePi/CLI contracts; L2 DirectKernel + behavioral mock on LocalBrowser stand-in
Commit: (working tree)

## Discovery

- `createPersistentExecutionHost` existed but production adapters never called it.
- `src/durable/adapters/{cli,pi}.ts` injected `FakeKernel(() => completed { ok: true })`
  when `BSA_DURABLE_HOST=1`, so attach looked successful without a Magpie browser or model.
- Magpie chat (`extension.ts`) still does not register durable Pi commands (R2.2).
- Kill-matrix helper FakeKernel remains a test double only.

## Implementation summary

- `src/durable/infrastructure/product-host.ts` — `runDurableAttempt`, `outcomeFromRun`,
  `createProductExecutionHost` (null without worker or stream).
- CLI `attachDurableHost`: `--host` / `BSA_DURABLE_HOST=1` requires a provider key and a
  started Magpie `BrowserWorker` under an isolated durable profile; fail closed otherwise;
  close worker after tick.
- Pi `registerDurablePiCommands({ hostFactory })` defaults to `() => null`.
- Dispatcher / stderr remediation names the miss.

## Initial evidence

```bash
npx tsx --test \
  tests/unit/durable-product-host.test.ts \
  tests/integration/durable-product-host.test.ts \
  tests/integration/durable-adapters-kill.test.ts
```

13 pass / 0 fail (includes kill matrix).

Highest evidence level claimed: **L6** (adapters) + **L2** (mock model observes fixture).

Non-evidence avoided: did not treat FakeKernel `{ ok: true }` as a host; did not claim
R2.E1 Magpie CDP reconnect or R2.E3 L7.

## Spec validation

| Requirement | Status |
| --- | --- |
| EXEC-05 DirectKernel + persistent Magpie path (product factory) | Pass (L2 stand-in + factory wiring) |
| ADAPTER-02 no claim of running without host | Pass |
| ADAPTER-04 construct host or runtime_unavailable nonzero | Pass (exit 4) |
| SCHED-02 missing host ≠ idle | Pass |
| `BSA_DURABLE_HOST=1` without model still exit 4 | Pass |
| Adapters do not import FakeKernel | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Fail-closed before Chrome when no API key |
| Boundaries | 4 | 4 | FakeKernel only in tests/helpers |
| Concurrency / crash | 3 | 3 | Kill matrix unchanged |
| Safety / privacy | 3 | 4 | Isolated durable profile under job root |
| Observability | 3 | 4 | Remediation names model vs worker vs unset |
| Perf/cost | 3 | 3 | Live model out of CI |
| Test realism | 3 | 4 | Behavioral mock observes `/apply` |
| Maintainability | 3 | 3 | |

Residual (P1): Magpie CDP client reconnect landed in CAMPAIGN-R2-E1 (2026-09-11, L5).
Pi-crash orphan Chrome still later.
Residual (P2): Magpie/hosted bind landed in CAMPAIGN-R2-2 (2026-09-11). Hosted/RPC
ExecutionHost twin still open (hosted ticks remain fail-closed).

## Improvement pass

- Check provider keys before launching Chrome so no-model attach cannot open a browser.
- Isolate durable attach profile under `<root>/durable/magpie-host`.

## Requirement coverage

EXEC-05, ADAPTER-02/04, SCHED-02 → `product-host.ts`, `adapters/{cli,pi}.ts`, tests above.

## Open risks / follow-ups

- R2.E3: two L7 smokes before deleting `src/jobs`
