# Jobs V2 — Evaluation Protocol

Status: **normative for every CAMPAIGN implementation ticket**.
Normative architecture: [`docs/jobs-v2-spec.md`](jobs-v2-spec.md).

An implementer (including a cheaper model) MUST follow this protocol for every task.
Green tests alone are not completion. A task closes only when the review record exists,
scores meet gates, the mandatory improvement pass landed, and cited requirements have
adversarial evidence.

---

## 1. Evidence levels (L0–L7)

Labels MUST NOT overclaim. Cite the highest level actually exercised.

| Level | What it proves | Typical command shape |
| --- | --- | --- |
| **L0** | Pure reducers/compilers; no I/O | unit tests over domain |
| **L1** | Production SQLite repository, migrations, uniqueness, concurrent claims | repository contract suite |
| **L2** | Deterministic scheduler/kernel fixtures; real local browser; behavioral mock model | fixture browser + mock that observes/reacts |
| **L3** | Multi-job / multi-tick with FakeClock and resource contention | runUntilIdle / tickDue simulations |
| **L4** | Spawned-process kill/restart and stale-fence rejection | child process + SIGKILL at boundaries |
| **L5** | Persistent `WorkerBrowserPort`/RPC profile reattach; headed rehydration | control process restart, same profile |
| **L6** | Pi / CLI / web / due adapters against the same application service | process CLI + FakePi contract |
| **L7** | Controlled live smoke; no unsafe external commit | manual/operator live with review template |

### Explicit non-evidence

These do **not** count as the production boundary even if the file is named e2e:

- Same-process “cold resume” that retains one BrowserPort/tab object
- CLI tick that returns idle because no model/browser was attached
- Challenge tests that inject `TOOL_PARK` instead of observing a challenge page
- Mock models that hard-code a fixed successful tool script when the ticket requires
  behavioral reaction
- Spec readiness tests that never call the materializer/repository they claim to cover

The existing 29 focused prototype job tests remain useful **L0–L2 component regression**
for prototype quarantine and importer fixtures. They are below the V2 production boundary
unless a ticket rewrites them to exercise that boundary.

---

## 2. Mandatory per-task protocol

### Step A — Discovery (no code yet)

1. Read every requirement ID cited by the ticket in `docs/jobs-v2-spec.md`.
2. Read current code paths and list invariants, production callers, and baseline tests.
3. Record discrepancies between prototype behavior and V2 requirements.
4. Stop if a requirement is ambiguous; escalate rather than invent architecture.

Write discovery notes at the top of the evaluation record (Step G).

### Step B — Implementation

1. Smallest coherent change that satisfies the cited IDs.
2. Do not weaken predicates, tests, safety policy, or evidence to obtain green output.
3. Do not expand scope into uncited requirements.
4. Keep domain free of banned imports (DOM-02).

### Step C — Initial evidence

1. Run the ticket’s named targeted tests.
2. Capture machine-readable output under `results/jobs-v2/<task-id>/` when useful
   (JSON reports, logs, screenshots metadata).
3. Note the highest evidence level actually reached.

### Step D — Fresh-context senior review

Review the diff **without trusting the implementation narrative**. Act as a senior
engineer who did not write the change.

Inspect and cite concrete files/symbols for:

1. Correctness vs cited requirements
2. Architectural boundaries (layers, banned imports, ports)
3. Concurrency / crash / lease / fence behavior
4. Safety / privacy (approvals, nondelegable, redaction, CAPTCHA non-solving)
5. Observability (IDs joinable across attempt/effect/human/metrics)
6. Performance / cost (no accidental prompt bloat; budgets enforced if in scope)
7. Test realism (evidence level honesty)
8. Maintainability (naming, duplication, dead paths)

List residual risks as P0 / P1 / P2.

### Step E — Quality scorecard (0–4 each)

| Score | Meaning |
| --- | --- |
| 0 | Missing or contradictory |
| 1 | Sketch only; major holes |
| 2 | Partial; known gaps documented |
| 3 | Solid for the ticket scope; residual risk acceptable |
| 4 | Exemplary; adversarial cases covered |

Categories (all required):

1. Correctness
2. Architectural boundaries
3. Concurrency / crash safety
4. Safety / privacy
5. Observability
6. Performance / cost awareness
7. Test realism
8. Maintainability

**Hard gates before improvement pass scheduling:**

- Correctness ≥ 3
- Safety / privacy ≥ 3
- Test realism ≥ 3
- No category &lt; 2
- Ticket-specific production boundary exercised (the minimum Evidence level on the ticket)

If a hard gate fails, fix before claiming an “initial” complete scorecard.

### Step F — Mandatory improvement pass

1. Identify the lowest-scoring category (tie-break: safety, then correctness, then test
   realism, then concurrency).
2. Land a concrete improvement: code, test, instrumentation, or specification clarification
   with owner approval for spec edits.
3. “No change needed” is **not** sufficient.
4. Record before/after scores and why the change addresses evidence, not style.

### Step G — Final evidence and review record

Rerun targeted tests plus the ticket’s required regression tier.

Create:

```text
work-items/evaluations/jobs-v2/<task-id>.md
```

Using the template in §4. Append; do not rewrite history of earlier attempts—mark
superseded sections if re-run.

### Step H — Completion gate

A ticket is done only when:

1. Every cited requirement ID has code **and** adversarial evidence at the required level
2. `work-items/evaluations/jobs-v2/<task-id>.md` exists and is complete
3. Scorecard meets hard gates after the improvement pass
4. No unresolved P0/P1 is buried only in Discussion
5. Traceability row can be added to the cutover report (requirement → code → test →
   evidence → initial score → improvement → final score)

---

## 3. Cutover evidence (CAMPAIGN-04-T03 / T04)

Before deleting the prototype or switching default commands:

1. Generate `results/jobs-v2/traceability.json` mapping every Jobs V2 requirement ID to
   owning ticket, code symbols, tests, evidence files, and final scores.
2. L4 fault matrix: kill before model call, between actions, after remote effect, before
   state commit; assert safe Effect/WorkItem/Attempt states.
3. L5: login to fixture via persistent profile; restart control process; observe same
   auth; reject stale refs.
4. L6: Pi FakePi, CLI process, web/RPC twin, due-tick with and without host.
5. Two L7 controlled smokes reviewed with `docs/live-run-review-template.md`; no live
   external commit in CI.
6. Prototype import/archive dry-run; malformed records quarantined.
7. Repo search: no production import of deleted `src/jobs` runner / sprint authority.

---

## 4. Evaluation record template

Copy into `work-items/evaluations/jobs-v2/<task-id>.md`:

```markdown
# Evaluation: CAMPAIGN-XX-TYY

Date:
Implementer:
Spec IDs:
Commit:

## Discovery
- Current code paths:
- Discrepancies:
- Baseline tests:

## Implementation summary
- Files changed:
- Requirements addressed:

## Initial evidence
- Commands:
- Results path:
- Highest evidence level claimed:
- Notes on non-evidence avoided:

## Senior review (fresh context)
- Correctness:
- Boundaries:
- Concurrency/crash:
- Safety/privacy:
- Observability:
- Performance/cost:
- Test realism:
- Maintainability:
- Residual risks (P0/P1/P2):

## Scorecard (initial)
| Category | Score | Notes |
| --- | --- | --- |
| Correctness |  |  |
| Architectural boundaries |  |  |
| Concurrency / crash safety |  |  |
| Safety / privacy |  |  |
| Observability |  |  |
| Performance / cost awareness |  |  |
| Test realism |  |  |
| Maintainability |  |  |

## Improvement pass
- Lowest category:
- Change made:
- Why this is evidence not style:

## Scorecard (final)
| Category | Before | After | Notes |
| --- | --- | --- | --- |
| ... |  |  |  |

## Final evidence
- Commands:
- Outcomes:

## Requirement coverage
| REQ-ID | Code | Test | Evidence level | Status |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Open risks / follow-ups
-
```

---

## 5. Implementer checklist (short)

```text
[ ] Read cited REQ-IDs in jobs-v2-spec.md
[ ] Discovery notes written before coding
[ ] Implementation limited to cited IDs
[ ] Targeted tests run; results captured
[ ] Fresh-context review written with file/symbol cites
[ ] Scorecard hard gates met
[ ] Mandatory improvement pass landed
[ ] Final tests + evaluation markdown committed
[ ] No P0/P1 left only in Discussion
```

---

## 6. Relationship to optimization backlog

Jobs V2 evaluation does **not** close QUAL/PERF hypotheses by itself.

- Integrated into V2 tickets: QUAL-02/03/04/06-infra; PERF-01/02/06/07/08/10/11/12/13
- Remain open for later evidence: QUAL-01, QUAL-05, PERF-03 (Fabric R&D), PERF-04,
  PERF-05, PERF-09

Cost deltas inform decisions; they do not fail CI alone. Safety and correctness gates do.
