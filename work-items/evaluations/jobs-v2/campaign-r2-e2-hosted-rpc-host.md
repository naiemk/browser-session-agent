# Evaluation: CAMPAIGN-R2-E2 (hosted/RPC ExecutionHost twin)

Date: 2026-09-12
Implementer: Auto (Composer)
Spec IDs: EXEC-05, ADAPTER-02, ADAPTER-04, SCHED-02
Evidence: L6 FakePi/OperatorRuntime + L2 JSON RpcBrowserPort tick. Do not claim L5/L7.
Commit: (this PR)

## Discovery

- R2.2 bound hosted `durable-*` commands with `hostFactory: () => null`, so ticks always
  `runtime_unavailable`. Residual P1 on CAMPAIGN-R2-2: Hosted/RPC ExecutionHost twin.
- `createProductExecutionHost` required an in-process `BrowserWorker`. Hosted chat has
  `RpcBrowserPort` + `RpcSessionHandle` over `NodeHub`, not a worker.
- Wrapping `RpcSessionHandle` as `BrowserWorker` was explicitly out of scope for R2.2
  (the stub `handle.worker` only exposes `stop()`).
- EXEC-05 already names the product browser as `WorkerBrowserPort` / **node-agent RPC**.
  `RpcBrowserPort` + `dispatchPortRpc` already exist and are proven in
  `tests/e2e/hosts-port-rpc.test.ts`.
- Hosted `composeBrowserAgent` constructed a **new** `RpcBrowserPort` per compose, so a
  durable host that minted a second port would split `lastObservation` cache.

## Implementation summary

- `persistent-host.ts` / `product-host.ts`: ExecutionHost from `BrowserPort` or Magpie
  `BrowserWorker`; optional `takeover` for headed rehydration.
- `pi-durable.ts`: `hostedDurableHostFactory` + node/model remediation;
  `wrapHostedKernel` maps `AgentError("node_disconnected")` to a retryable failed
  outcome; `warmCreateLiveModel` skips in-flight duplicates.
- `OperatorRuntime`: one `rpcBrowser` shared by chat tools and durable ticks;
  `nodeConnected: () => hub.connected`; takeover via `RpcSessionHandle.takeover`.
- Tests: FakePi L6, OperatorRuntime disconnected bind, JSON RPC L2 fixture tick.

## Initial evidence

```bash
npx tsx --test tests/unit/pi-durable.test.ts tests/unit/durable-product-host.test.ts \
  tests/integration/durable-product-host.test.ts tests/integration/durable-rpc-host.test.ts
```

17 pass / 0 fail (then 18 after improvement-pass disconnect wrap).

Highest evidence level claimed: **L6** (adapters) + **L2** (RPC-serialized fixture tick).

Non-evidence avoided: no L7 live job; no CDP reconnect claim; no `createLiveModel` in
unit tests; LocalBrowser is the RPC far side in L2, not a product ExecutionHost;
did not claim R2 shipped / R2.E3 / R2.4.

## Spec validation

| Requirement | Status |
| --- | --- |
| EXEC-05 DirectKernel + node-agent RPC | Pass (L2 JSON `RpcBrowserPort`; hosted factory uses that port) |
| ADAPTER-02 no claim of running without host | Pass (disconnected / no-model `runtime_unavailable` + remediation) |
| ADAPTER-04 construct host or runtime_unavailable | Pass (factory null vs `hosted-rpc` host) |
| SCHED-02 missing host ≠ idle | Pass (FakePi disconnected tick) |
| Not `RpcSessionHandle.worker` | Pass (source scan) |
| FakeKernel not imported on bind surfaces | Pass |

## Senior review

Inspected `product-host.ts`, `persistent-host.ts`, `pi-durable.ts`, `runtime.ts`,
`durable-rpc-host.test.ts`, `pi-durable.test.ts`.

1. **Correctness** — Connected+model constructs DirectKernel; disconnected/no-model is
   `runtime_unavailable`. L2 tick observes fixture `/apply` through JSON RPC. Magpie
   worker path unchanged.
2. **Boundaries** — Hosted host is `RpcBrowserPort`, not `handle.worker`. Durable model
   is still env-key `createLiveModel`, not Pi. Adapters still call `JobApplicationService`.
3. **Concurrency / crash** — Factory checks `hub.connected` at tick start. Mid-tick
   disconnect originally threw out of the dispatcher (same as chat tools).
4. **Safety / privacy** — No API-local Chromium from status or a down node. Headed
   takeover uses existing session RPC. Magpie/hosted SQLite stay separate `coreRoot()`.
5. **Observability** — Node vs no-model vs legacy no-host remediation strings.
6. **Perf / cost** — Warm model skipped under `NODE_TEST_CONTEXT`; bind+session_start
   could fire `createLiveModel` twice.
7. **Test realism** — JSON round-trip on every port call. OperatorRuntime production bind
   covered for the disconnected case. No live websocket+node-agent durable tick (not L7).
8. **Maintainability** — `PersistentHostOptions.worker` is optional with `worker!`;
   kernel wrap mutates `host.kernel`.

Residual (P1): live WS node-agent durable tick still later (L7 / pairing). Residual
(P2): Magpie `worker!` in persistent-host; R2.E3; R2.E4 not on `main`.

## Scorecard (initial)

| Category | Score | Notes |
| --- | --- | --- |
| Correctness | 3 | Connected path + fail-closed proven |
| Architectural boundaries | 4 | Port not SessionHandle-as-worker |
| Concurrency / crash safety | 2 | Mid-tick disconnect threw |
| Safety / privacy | 3 | No surprise API Chrome |
| Observability | 4 | Node vs model copy |
| Performance / cost awareness | 3 | Double warm possible |
| Test realism | 3 | L2 JSON RPC; no live WS tick |
| Maintainability | 3 | Optional worker + kernel wrap |

Hard gates met except concurrency = 2 before the improvement pass.

## Improvement pass

Lowest category: concurrency / crash safety.

- Wrap hosted kernel so `AgentError("node_disconnected")` becomes
  `{ status: "failed", code: "node_disconnected", retryable: true }` instead of an
  uncaught throw through `dispatchDueJob`.
- Guard `warmCreateLiveModel` against overlapping in-flight calls.

## Scorecard (final)

| Category | Before | After | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Disconnect wrap + L2 tick |
| Architectural boundaries | 4 | 4 | Unchanged |
| Concurrency / crash safety | 2 | 3 | Typed mid-tick node drop |
| Safety / privacy | 3 | 3 | Unchanged |
| Observability | 4 | 4 | Unchanged |
| Performance / cost awareness | 3 | 3 | Warming flag |
| Test realism | 3 | 4 | Disconnect-wrap unit + JSON L2 |
| Maintainability | 3 | 3 | Wrap is local to hosted factory |

## Final evidence

```bash
npx tsx --test tests/unit/pi-durable.test.ts tests/unit/durable-product-host.test.ts \
  tests/integration/durable-product-host.test.ts tests/integration/durable-rpc-host.test.ts
```

## Requirement coverage

| REQ-ID | Code | Test | Evidence level | Status |
| --- | --- | --- | --- | --- |
| EXEC-05 | `product-host.ts`, `pi-durable.ts` `hostedDurableHostFactory`, `runtime.ts` `rpcBrowser` | `durable-rpc-host.test.ts`, factory tests | L2, L6 | Pass |
| ADAPTER-02 | hosted remediation | FakePi disconnected tick, OperatorRuntime bind | L6 | Pass |
| ADAPTER-04 | factory null / host | factory + FakePi connected mock tick | L6 | Pass |
| SCHED-02 | dispatcher via service.tick | FakePi disconnected; L2 tick not idle | L6, L2 | Pass |

## Open risks / follow-ups

- R2.E3 two L7 smokes before deleting `src/jobs`
- R2.E4 prototype import dry-run (PR #61 merged onto the E1 branch, not `main`)
- Live hosted pairing: websocket node-agent + env-key model still operator evidence, not this ticket
- Magpie laptop SQLite and hosted API SQLite remain different `coreRoot()` processes
