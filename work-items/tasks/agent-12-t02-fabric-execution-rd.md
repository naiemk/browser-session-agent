---
id: AGENT-12-T02
title: Evaluate Pi Fabric as an opt-in browser execution kernel
story: AGENT-12
epic: agent
status: todo
depends: AGENT-12-T01
---

# AGENT-12-T02 — Evaluate Pi Fabric as an opt-in browser execution kernel

## Question

Can Pi Fabric execute bounded batches of existing Magpie browser operations inside one
checked QuickJS program, reducing model turns, context growth, cost, and wall time without
weakening behavior or safety?

This is an R&D task on an isolated branch. Completion produces evidence and a decision,
not an automatic merge.

## Spec

- [Fabric execution experiment](../../docs/fabric-execution-experiment.md) — complete
  architecture, isolation, safety, telemetry, and decision thresholds.
- [Live-run investigation](../../docs/live-run-investigation-plan.md) — PERF-01,
  PERF-03, PERF-04, PERF-06, PERF-07, PERF-08, and PERF-10.
- [docs/decisions.md](../../docs/decisions.md) — D2, D17, D18, D20–D23, D29, D31,
  D44, and D56.
- [Challenge and approval handling](../../docs/challenge-and-approval-handling.md) —
  shared typed block and circuit-breaker contract.
- [AGENT-12-T01](agent-12-t01-node24-pi-upgrade.md) — Node/Pi prerequisite.
- [Pi Fabric](https://www.npmjs.com/package/pi-fabric) — upstream package.

## Discovery

1. Create a disposable branch or worktree after AGENT-12-T01 lands. Record the baseline
   commit before any Fabric change.
2. Pin one exact Pi Fabric version after reviewing its source, release notes, license,
   Node/Pi requirements, known limitations, and dependency tree. The npm page reported
   `0.89.1` while upstream `main` declared `0.90.0` later during initial discovery, so do
   not use a floating pre-1.0 range.
3. Prove how Fabric initialization, tool ownership, prompt injection, capture, provider
   discovery, nested results, cancellation, and unload behave in the installed version.
4. Measure the ordinary direct path before changing prompts or tools:
   - outer model turns;
   - actions/probes and results per item;
   - context bytes and tool-schema bytes;
   - fresh, output, and cache-read tokens;
   - recorded cost and wall time;
   - result quality and evidence coverage.
5. Trace one repeated direct sequence and identify exactly which decisions require a model
   turn versus deterministic orchestration.
6. Resolve every open question in the design spec with a source citation or executable
   canary.

## Build on the experiment branch

1. Add a separate experimental extension entry point. The ordinary `src/extension.ts` and
   `magpie` launch do not import or initialize Fabric.
2. Add `magpie --experimental-fabric` to load the wrapper explicitly.
3. Register `/browser-execution status|direct|fabric`. Start every process in `direct`;
   keep mode session-local and reject switching during active work.
4. Represent execution mode as a `CapabilityCoordinator` constraint. Test direct/Fabric,
   plan-mode, and job-planning transitions in every exit order.
5. Configure TypeScript QuickJS only. Disable native Node/Bun/CPython, automatic extension
   capture, MCP, agents, actors, mesh, residency, schema effects, prewalk, and speculative
   execution.
6. Register a closed `magpie` Fabric provider for only the browser operations needed by the
   experiment. Do not expose job-planning or subagent controls.
7. Route provider calls through the same Magpie implementation, `guardedAct`, evidence,
   redaction, and tab ownership as direct calls. Add no second action implementation.
8. Add host-enforced per-program call, action, item, time, output, no-progress, and
   concurrency limits. Serialize browser operations; reject parallel browser calls in the
   initial experiment.
9. Return typed batch rows, explicit failures, evidence IDs, a checkpoint, and usage. Keep
   raw nested observations out of the parent result.
10. Add stable mode and execution IDs to Pi, Fabric, Magpie, browser-ledger, and artifact
    metrics so one run can be joined without timestamps or prose parsing.
11. Add the bounded orchestration guidance from the design spec. Keep domain qualification
    criteria in the task, never in the provider.
12. Preserve a one-command removal path: deleting the experimental entry point,
    configuration, and dependency restores the ordinary build without a storage migration.

## Safety canaries

The experiment stops immediately if any canary fails:

- generated code obtains ambient filesystem, network, subprocess, Playwright, CDP, or DOM
  access;
- a Fabric call bypasses `guardedAct`, postconditions, approval, redaction, or evidence;
- two browser operations execute concurrently;
- plan mode or job planning leaves execution capabilities active;
- a denied or takeover-required action is skipped while the program continues;
- a challenge page satisfies an ordinary URL postcondition or is caught by generated code
  and the program continues;
- a Fabric program issues another provider call after the host or session challenge
  breaker opens;
- cancellation leaves the program issuing new calls;
- ordinary `magpie` loads Fabric or changes its active tools;
- existing goals or jobs require migration to run the experiment.

## Experiments

1. Run the integration canaries from the design spec.
2. Run the direct and Fabric paths against all six deterministic fixture scenarios.
3. Replay identical saved evidence through both result-review paths.
4. Run at least two controlled live tasks after the user approves the branch for testing:
   one repeated read-only collection and one exception/interruption case.
5. Keep models, task card, item list, starting browser state, criteria, and commit fixed
   within each comparison.
6. Use bounded batches and browser concurrency one.
7. Fill `docs/live-run-review-template.md` for each run and append raw findings to
   `docs/live-run-evidence-log.md`.

## Tests

At minimum:

- default launcher omits the experimental entry point and Fabric package;
- experimental launcher resolves the pinned package and wrapper;
- a fresh experimental session starts in direct mode;
- `/browser-execution` changes only the execution-mode constraint;
- direct/Fabric and plan/job constraints compose in either exit order;
- provider descriptors expose only reviewed refs and conservative effects;
- nested calls use the existing action executor exactly once;
- per-program budgets cannot be overridden by generated code;
- browser `Promise.all` is rejected without starting concurrent work;
- denial, takeover, timeout, and cancellation stop the batch;
- challenge detection and host/session breakers stop the batch and preserve its checkpoint;
- nested raw observations do not appear in the outer Pi context;
- returned rows validate against the supplied task schema;
- ordinary unit, integration, E2E, suite, packaging, and CLI tests remain green.

Run:

- `npm run typecheck`
- `npm test`
- `npm run suite:reference`
- `npm run suite`
- `npm run cli -- --check`
- the focused experiment fixture command added by this task

## Evidence

For every baseline/Fabric pair, record:

- commits, versions, configuration digest, task, model timeline, and starting state;
- outer turns, nested calls, browser actions, probes, compile attempts, and failures;
- fresh/output/cache-read tokens, cost, context bytes, and wall time;
- rows attempted/completed, external-criteria completion, human quality score, and evidence
  coverage;
- every approval, takeover, cancellation, timeout, and no-progress event;
- artifact consistency and any duplicate side effect;
- raw paths sufficient to reproduce the comparison.

Report normalized values per attempted item, completed item, accepted item, and top-level
requirement.

## Discussion and decision

Review against the thresholds in `docs/fabric-execution-experiment.md`:

- Did Fabric remove model interpretation turns, or merely move cost into compile repairs?
- Did fewer parent messages materially reduce cache reads and context?
- Was wall time limited by the model loop or by page/network latency?
- Did batching reduce the model's ability to notice changed page shape?
- What batch size preserved useful interruption and checkpoint behavior?
- Did the provider remain generic across fixture and live tasks?
- Is upstream lifecycle/version churn acceptable for a production dependency?
- Should the result be full Fabric adoption, concept-only adoption, more evidence, or
  rejection?

If accepted, create a new production task that states which experimental code will be
rewritten or retained, updates D18 explicitly, and defines staged rollout. Do not change
accepted architecture by marking this R&D task done.

## Done when

The isolated branch implements the opt-in path, all safety canaries and deterministic tests
pass, at least two controlled live comparisons are recorded, the decision thresholds are
calculated from raw evidence, and one of the four outcomes in the design spec is written
down with reasons. No merge to the production path occurs as a side effect of completion.
