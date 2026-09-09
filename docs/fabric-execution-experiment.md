# Fabric execution experiment

Status: R&D hypothesis. This is not an accepted production architecture.

Owner work item: [AGENT-12-T02](../work-items/tasks/agent-12-t02-fabric-execution-rd.md).
Prerequisite: [AGENT-12-T01](../work-items/tasks/agent-12-t01-node24-pi-upgrade.md).
Challenge and approval contract:
[challenge-and-approval-handling.md](challenge-and-approval-handling.md).

## Decision sought

Determine whether Pi Fabric can remove most model round trips from repetitive browser work
without weakening Magpie's browser safety, evidence, quality, cancellation, or ordinary
non-Fabric behavior.

The experiment should answer a narrow question:

> Can one model-authored, type-checked orchestration program safely execute a bounded batch
> of existing Magpie browser operations, then return compact typed results, more cheaply
> and quickly than asking the model what to do after every operation?

The experiment does not pre-approve replacing the runtime, task graph, jobs, scheduler, or
browser harness.

## Why this is worth testing

The `goal_mtrvevpq001` run used 417 model turns:

- 6 GPT planning turns and 411 GLM execution turns;
- 234 `act`, 150 `probe`, and 4 `observe` calls;
- 24.7 million cache-read tokens;
- 1.61 MB final context;
- roughly 74 minutes elapsed.

Much of the execution repeated a regular sequence: navigate to an entity, extract the same
fields, classify or record it, and continue. The model acted as an interpreter for a loop
that changed little between entities.

Pi Fabric exposes one `fabric_exec` tool. The model writes a checked TypeScript program;
isolated QuickJS runs its branches and loops and invokes host capabilities through a
validated bridge. Only the program's returned value enters the parent model context.
Nested tool results remain available to audits and activity UI without becoming hundreds
of parent conversation messages.

This directly tests the hypotheses in PERF-03, PERF-04, PERF-06, and PERF-07 in
`docs/live-run-investigation-plan.md`.

## Existing decisions and the experimental amendment

The following decisions remain authoritative during the experiment:

- D2: Magpie owns the Playwright worker.
- D17: every accepted action passes the harness and a postcondition.
- D20: the executor cannot weaken the criteria that judge it.
- D21: model-authored mutation scripting stays excluded.
- D22: authenticated reads are sensitive and recorded.
- D23: reversibility is judged per situation.
- D29: mechanism cost is part of correctness.
- D31 and D57: jobs remain explicit and transactional; campaigns share the same bounded
  attempt and execution-kernel contract.

D18 currently specifies a closed page-plan DSL and forbids model-authored Playwright
JavaScript. Fabric is a broader orchestration language than that DSL. The experiment is
permitted because Fabric code receives no Playwright object, DOM mutation primitive,
filesystem, network, subprocess, or ambient host access. It may invoke only the explicit
Magpie provider capabilities, and every browser action still crosses `guardedAct`.

That preserves the safety purpose of D18 but not its literal closed-DSL mechanism. A
production adoption therefore requires an explicit decision updating D18. Running the
experiment does not update it.

## Goals

1. Reduce outer model turns for repeated browser operations by at least 5x on a
   representative collection task.
2. Keep nested browser output out of the parent context unless the program returns it.
3. Preserve all existing action verification, approval, redaction, evidence, tab ownership,
   takeover, and browser serialization.
4. Return typed per-item records with evidence IDs and explicit failures.
5. Allow a user to enter and leave the experiment explicitly.
6. Keep the normal `magpie` launch and current direct-tool behavior unchanged.
7. Produce enough telemetry to decide adoption, rejection, or a smaller concept-only
   implementation.

## Non-goals

- Replacing the job graph or scheduler.
- Enabling Fabric actors, mesh, residency, councils, prewalk, MCP, or multi-agent swarms.
- Running browser calls concurrently.
- Giving generated code direct Playwright, CDP, DOM, Node, Bun, CPython, filesystem, or
  network access.
- Moving qualification policy or domain knowledge into product code.
- Claiming that fewer turns improve relevance. Result quality is measured separately.
- Merging the experimental branch because it compiles. Adoption requires live evidence.

## Isolation

### Source isolation

Build the experiment on a disposable branch or worktree from the revision where
AGENT-12-T01 has landed. Record:

- baseline commit;
- experiment commit;
- exact `pi-fabric` version;
- Node, npm, and Pi versions;
- Fabric configuration digest.

Do not mix unrelated fixes into that branch. If Fabric is accepted, create a production
implementation plan and reviewable PR from the evidence; do not merge the R&D branch
wholesale.

### Runtime isolation

The ordinary command remains unchanged:

```text
magpie
```

It must not import, initialize, configure, or expose Pi Fabric.

The experiment uses an explicit launch:

```text
magpie --experimental-fabric
```

That flag selects a separate extension entry point which initializes Magpie plus the pinned
Fabric package. A normal process and an experimental process can therefore be compared from
the same revision.

Inside the experimental process, register:

```text
/browser-execution status
/browser-execution direct
/browser-execution fabric
```

The process starts in `direct` mode. Fabric execution begins only after the operator
selects it. The mode is session-local and returns to `direct` on every new process. Mode
changes are rejected while a model turn or Fabric program is active.

`direct` inside an experimental process is a recovery path, not a scientifically exact
baseline: Fabric remains loaded and may alter stable prompt prefix or lifecycle behavior.
Measurements compare the ordinary non-Fabric process with the experimental Fabric process.

## Proposed architecture

```text
ordinary launch
  Pi
    -> Magpie extension
      -> existing direct tools
        -> core guard / evidence / BrowserPort
          -> Playwright worker

experimental launch, direct mode
  Pi
    -> experimental wrapper
      -> Magpie extension
      -> Pi Fabric loaded but fabric_exec inactive
      -> existing direct tools active

experimental launch, Fabric mode
  Pi model
    -> fabric_exec
      -> checked TypeScript in QuickJS
        -> explicit magpie.* provider calls
          -> existing Magpie tool/core boundary
            -> core guard / evidence / BrowserPort
              -> Playwright worker
      <- compact typed batch result
```

Fabric must sit above the existing browser boundary. It does not call Playwright or the
worker directly.

## Integration choice

Use an explicit Fabric provider, not automatic capture, for the main experiment.

Automatic capture is useful for an initial smoke test, but it would discover every
registered Magpie, plan-mode, subagent, and job tool. Its captured return envelope is also
larger than the stable data the orchestration program needs. A provider gives the experiment:

- a closed, reviewed action catalog;
- precise input and output schemas;
- conservative risk and effect metadata;
- access to `parentToolCallId` for per-program budgets;
- one place to serialize browser calls;
- compact structured return values;
- no accidental exposure of job-planning or parent-control tools.

Configure automatic extension capture off for the experimental runtime. Disable Fabric
MCP, agents, actors, mesh, residency, schema effects, prewalk, speculative calls, and native
execution. Use TypeScript with QuickJS only.

The npm page reported Pi Fabric `0.89.1` when discovery began while the upstream `main`
package declared `0.90.0` later the same day. Pin one reviewed exact version on the
experiment branch; do not use a caret range for a pre-1.0 architectural dependency.

## Provider surface

Name the provider `magpie`. It exposes generic browser capabilities, not site or campaign
concepts. Phase one should include only the minimum needed for repeated collection:

- `magpie.observe`
- `magpie.probe`
- `magpie.act`
- `magpie.peek`
- `magpie.survey`
- `magpie.check`

Consider `remember` and artifact/result persistence only after the loop experiment works.
Keep `ask_user`, `report`, and `park` as direct parent controls unless a termination test
proves that nesting them has identical Pi semantics.

Each provider action:

1. validates against its Fabric descriptor;
2. reserves budget for the enclosing `parentToolCallId`;
3. enters the single browser queue;
4. calls the same measured Magpie implementation used by direct mode;
5. preserves the Pi tool lifecycle and current `ExtensionContext`;
6. returns a compact structured projection;
7. releases the queue and records duration/outcome.

The adapter must not duplicate action execution or policy logic.

### Risk and effects

Descriptors are conservative:

- observation and local page queries: `read`;
- authenticated navigation or fetching: `network`;
- action multiplexers and artifact writes: `execute` or `write`;
- browser resources: ordered and scoped to the active run/tab;
- unknown external consequences: emission, never transactional.

Fabric approval policy must not become the browser policy. For the closed experimental
catalog, Fabric may allow transport to the provider; Magpie's own contextual gate remains
the final authority and may ask, deny, park, or require takeover. A Fabric setting must
never turn a denied Magpie action into an allowed action.

### No parallel browser operations

Fabric supports `Promise.all`, but independent model computations do not make operations
against one authenticated tab independent. The provider serializes all browser calls.

Concurrent calls against the same run are either queued in source order when that order is
unambiguous or rejected with a clear error telling the program to await each call. The
initial experiment should reject browser `Promise.all`; this makes pacing and evidence
order easy to prove.

Parallel child agents are disabled.

## Execution contract

One `fabric_exec` program handles one bounded batch, not an entire open-ended goal.

A typical program may:

1. iterate over a supplied list of entity URLs;
2. navigate using `magpie.act`;
3. call `magpie.probe` with a task-defined read query;
4. project the result into the task's record schema;
5. catch an item-local read failure and continue;
6. stop on a policy, takeover, cancellation, systemic, or budget failure;
7. return `{ rows, failures, checkpoint, usage }`.

Large task text and item lists enter through Fabric payloads, not interpolated source code.
The generated TypeScript contains orchestration only.

The host enforces limits independently of checks written by the model:

- maximum nested provider calls;
- maximum browser actions;
- maximum items returned;
- maximum wall time;
- maximum result bytes;
- maximum consecutive no-progress results;
- one active Fabric program per Magpie run;
- one browser operation at a time.

Initial values should make a batch complete in two to five minutes. Start with 20 items,
100 nested calls, 50 browser actions, and a five-minute outer deadline; tune from measured
latency rather than silently increasing them.

The model cannot override host limits. Fabric's own timeout and memory ceilings are a
second boundary, not a replacement.

## Result contract

The outer result is task-generic but structurally fixed:

```typescript
interface FabricBrowserBatchResult {
  status: "completed" | "partial" | "blocked" | "cancelled" | "failed";
  rows: Array<{
    entityKey: string;
    value: unknown;
    evidenceIds: string[];
  }>;
  failures: Array<{
    entityKey?: string;
    stage: string;
    code: string;
    message: string;
    retryable: boolean;
    evidenceIds: string[];
  }>;
  checkpoint: {
    attempted: number;
    completed: number;
    nextIndex: number;
  };
  usage: {
    hostCalls: number;
    browserActions: number;
    elapsedMs: number;
  };
}
```

The task supplies and validates the schema inside each row's `value`. Product code does not
define “candidate,” “profile,” “job,” or another domain record.

Raw observations do not enter the outer result unless needed to explain a failure. Evidence
IDs point to the existing private ledger and payload artifacts. Redaction happens before
any value crosses into QuickJS.

## Failure and interruption behavior

- Item-local extraction failures may be returned and the next item attempted.
- Repeated identical failures trip the no-progress limit and stop the batch.
- A denied approval stops the batch; it does not skip ahead to other actions.
- CAPTCHA, OTP, credential entry, or takeover stops with `blocked`.
- Magpie's post-observation challenge detector runs inside every provider call. A
  high-confidence challenge overrides an otherwise successful URL/postcondition result
  and returns a typed `blocked.challenge` failure with evidence IDs.
- The provider opens the same host/session breakers used by direct mode. Fabric code
  cannot catch a challenge and continue to the same host or reset a breaker.
- A session challenge budget terminates the batch after a bounded cluster across distinct
  hosts; it does not let generated code enumerate origins until one passes.
- Cancellation propagates through Fabric to the active provider call and browser worker.
- A timeout stops future calls and reports the durable evidence already written.
- The model never automatically reruns the whole batch after a partial result.
- Retry starts at `checkpoint.nextIndex` with the prior rows supplied as immutable input.

The first R&D version may lose in-memory rows if the process is killed between outer
returns, because its batches are read-only and replayable. Production adoption requires a
generic per-item checkpoint sink or an explicit decision that small replayable batches are
sufficient.

## Capability composition

Execution mode is another constraint in `CapabilityCoordinator`, not another
`setActiveTools` writer.

Conceptually:

- `direct`: existing Magpie model tools active; `fabric_exec` disabled.
- `fabric`: `fabric_exec` plus required parent controls active; direct browser primitives
  hidden from the model but callable only through the provider.
- plan mode: browser execution disabled regardless of direct/Fabric selection.
- job planning: only planning capabilities active.
- leaving plan/job mode restores the selected execution mode, not a stale snapshot.

Add tests for both exit orders and for repeated direct/Fabric toggles. The experiment must
not reintroduce the “last writer wins” regression.

Phase one excludes durable-job dispatch. If Fabric mode is selected while a job is active,
report that the experiment currently supports one-shot interactive goals only. Later
integration implements the same `ExecutionKernel` port as direct execution: the scheduler
leases a bounded homogeneous read-only batch, each case receives an independent durable
outcome/checkpoint, and the transactional job repository remains outside Fabric. Jobs are
considered only after direct persistent-browser dispatch passes the CAMPAIGN-02 and
CAMPAIGN-04 gates.

## Model guidance

The experimental prompt must explain:

- use one Fabric program for a repeated, already-understood recipe;
- use sequential awaited browser calls;
- keep batches bounded;
- return only typed rows, failures, checkpoint, and usage;
- do not embed raw snapshots or item data in source;
- stop on authorization, takeover, or systemic failures;
- ask the model again when the page shape or required judgment changes;
- do not use Fabric for one-off ambiguous actions where observation should reach the model.

The prompt must not claim that Fabric improves quality. It reduces orchestration turns.

## Instrumentation

Record a mode and execution ID on every relevant event. A Fabric run must be reconstructable
across the Pi transcript, Fabric trace, Magpie metrics, browser ledger, and result artifact.

Required metrics:

- outer model turns by provider/model and phase;
- Fabric compile attempts and type-check failures;
- Fabric executions, duration, input bytes, output bytes, and terminal status;
- nested calls by ref, outcome, latency, and failure stage;
- browser actions and probes per item;
- fresh input, output, cache-read tokens, and recorded cost;
- context bytes after each outer turn;
- rows attempted, completed, accepted, and rejected;
- evidence completeness and artifact consistency;
- approval, takeover, timeout, cancellation, and no-progress events;
- challenge detector signals, host/session breaker transitions, and browser calls after
  first challenge;
- direct versus Fabric mode transitions.

PERF-01 must be fixed or compensated from transcript evidence before attributing savings by
model. “One outer tool call” is not itself success; compare total tokens, cost, time, and
useful results.

## Experiment matrix

### Stage 1 — integration canaries

Prove:

- ordinary `magpie` does not load Fabric;
- experimental launch starts in direct mode;
- explicit mode switching composes with plan mode and job planning;
- QuickJS has no ambient filesystem, network, process, Playwright, or CDP access;
- a provider action still passes the existing guard and evidence wrappers;
- an unauthorized action is denied even if Fabric transport policy allows the provider;
- cancellation reaches a deliberately slow browser call;
- concurrent browser calls are rejected or serialized as specified.

### Stage 2 — deterministic fixtures

Run both direct and Fabric paths against:

1. a 50-entity repeated-read fixture;
2. a nested scroller with bounded pagination and no-progress termination;
3. a fixture where 10 percent of entities have a different page shape;
4. a stale-ref/navigation race;
5. an approval canary that must never commit;
6. a task requiring a mid-batch clarification;
7. a challenge page whose requested URL loads successfully but whose operation outcome
   must be `blocked`, followed by a canary proving no later item is attempted;
8. challenges on multiple hosts that trip the session budget without generated-code
   retries.

Use the same model, task card, entities, initial browser state, and external criteria. Run
each path at least three times when model nondeterminism matters.

### Stage 3 — replayed evidence quality

Before live browsing, feed identical saved evidence rows to the direct and Fabric review
paths. Compare typed-record completeness and relevance judgments. This separates execution
compression from model/rubric quality.

### Stage 4 — controlled live runs

Run at least two comparable live tasks:

- one repeated read-only collection task;
- one mixed task with exceptions, bounded scrolling, and an operator interruption.

Use small batches first. Do not enable browser concurrency. Fill
`docs/live-run-review-template.md` and append results to
`docs/live-run-evidence-log.md`.

## Decision thresholds

Fabric becomes a production candidate only if all safety invariants pass and the controlled
runs show:

- at least 5x fewer outer execution turns;
- at least 30 percent lower model cost per useful accepted item;
- at least 30 percent lower wall time per completed item;
- at least 60 percent lower peak or final parent context bytes on the repeated task;
- no more than 5 percentage points lower human-judged precision;
- no material reduction in completion rate or evidence coverage;
- zero guard, approval, takeover, or tab-ownership bypasses;
- cancellation and bounded-failure behavior recover without repeating an external effect.
- zero nested calls after a challenge breaker opens, except the explicit resume path.

These are initial thresholds, not facts. Report confidence and raw values. A small task that
cannot exercise the loop is inconclusive.

Reject production integration if any safety boundary is bypassed, Fabric requires native
execution, current behavior cannot remain an opt-in fallback, compile/retry churn consumes
most saved turns, or quality falls by more than 10 percentage points.

Possible decisions:

1. Adopt Fabric behind an experimental flag and start a production hardening task.
2. Adopt only the provider/batch/result ideas in Magpie's existing closed interpreter.
3. Keep Fabric as a developer experiment and gather more evidence.
4. Reject it and record the observed blocker.

## Rollback and cleanup

- Removing the experimental launcher and exact dependency restores the original product;
  ordinary source paths contain no Fabric imports.
- Fabric state and configuration live under an experiment-specific project location and
  are not required to read Magpie goals or jobs.
- No storage migration is allowed in the R&D branch.
- Uninstalling Fabric leaves browser profiles, goal evidence, and job JSON unchanged.
- Experimental artifacts are labeled with the baseline and experiment commits so they are
  not confused with production measurements.

## Open questions

1. Can Pi Fabric be initialized safely by a separate extension wrapper without writing
   global user configuration?
2. Does its full-code prompt remain visible when `fabric_exec` is inactive?
3. Can a custom provider call the existing registered Magpie executor while preserving the
   complete native Pi lifecycle exactly once?
4. Should parent controls remain direct, and does nested `terminate` have equivalent
   semantics?
5. How should a generic checkpoint sink validate task-defined row schemas?
6. What batch size balances lower turn count against cancellation latency and lost
   in-memory partial rows?
7. Does Fabric's trace duplicate sensitive Magpie evidence, and can its retention be
   reduced without losing performance data?
8. Is TypeScript compile repair rare enough on the selected execution model?
9. Does disabling automatic capture leave all direct Magpie tools truly unchanged?
10. Can Fabric's entropy metric consume our provider traces usefully, or should equivalent
    repeated-recipe metrics remain in Magpie?

Each answer needs executable evidence or an upstream source citation, not an assumption.
