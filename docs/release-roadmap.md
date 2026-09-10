# Release roadmap

Living checklist. Tick boxes here as work lands. Do not rewrite a ticked step; add a
dated note under it if the outcome was partial.

**As of 2026-09-10.** Current position: **R1.4 FakePi landed, live eval open.** Interactive
Magpie chat works. `/plan` Execute now invokes `/coach` after pre-coach `[DONE:n]`.
Instagram harvests still wander until a live `/plan` Execute with host `/coach` beats
`goal_mtrvevpq001`. `goal_mtumeewm001` does not close E2.
PR #55 is on `main`. AGENT-16-T01..T03 and T05 are in tree.

**Next two pieces of work, in parallel — not a single queue:**

1. **R1.E2** — live party.txt `/plan` then Execute (host `/coach` after scout).
   Prove less wandering without typing `/coach`.
2. **E-QUAL** — one more comparable collection run on a **different domain**, then the
   decision review.

Do not spend the next cycle on QUAL/PERF *behavioral* tickets, default-on challenge or
approval flags, AGENT-13-T04, or AGENT-16-T04 (that is R3).

Authority for tickets stays in the specs and work items. This file is the **order and
the gates**, not a second spec.

| Release | What the operator can do | Status |
| --- | --- | --- |
| R0 | Drive a browser from chat; hosted Pre-V1/V1 surface | Shipped |
| R1 | Cheap harvest after a coached loop (`/plan` + `/coach`) | **T05 FakePi landed; R1.E2 live next** |
| R2 | Durable job ticks on the Magpie browser (V2 is the product path) | Blocked on real host + L7 |
| R3 | Job itself schedules scout → coach → harvest | After R1 and R2 |
| R4 | Collection quality tickets that survive the live-run review | After evidence gate E-QUAL |
| R5 | Recurring multi-case campaigns over calendar time | After R2 proven live |

Related: [`docs/coach.md`](coach.md), [`docs/jobs-v2-spec.md`](jobs-v2-spec.md),
[`docs/jobs-v2-evaluation.md`](jobs-v2-evaluation.md),
[`docs/live-run-investigation-plan.md`](live-run-investigation-plan.md),
[`docs/live-run-evidence-log.md`](live-run-evidence-log.md),
[`docs/challenge-and-approval-handling.md`](challenge-and-approval-handling.md),
[`docs/autonomous-agent.md`](autonomous-agent.md).

---

## How to tick

1. A **build** step ticks when its named tests are green and the ticket evaluation
   (or a one-line note here) exists.
2. An **evaluation** step ticks when the evidence file exists, not when someone
   intends to run it. Live runs append to [`docs/live-run-evidence-log.md`](live-run-evidence-log.md)
   and fill [`docs/live-run-review-template.md`](live-run-review-template.md).
3. A **release** ticks only when its exit criteria are all ticked. Soft cutover is
   not a release.
4. Do not start the next release's *product claim* until that release's evaluation
   gate is ticked. Parallel *build* on a later release is allowed only where the
   table says so (R1 and E-QUAL; R1 T04 compiler vs R2 host).

---

## Do this / do not do this

**Do next**

- Run **R1.E2**: same `docs/example-prompts/party.txt`, `/plan` then Execute
  (T05 host `/coach` after scout). Compare wandering vs `goal_mtrvevpq001`. Do not
  treat `goal_mtumeewm001` as E2 (fake planner coach). Append an evidence-log row.
  Do not call coach a success until this lands.
- Run **E-QUAL**: a collection task on SaaS / conference CFPs / apartments. Not
  Berlin checkout, not Magpie coder harvest, not another Instagram tagged-feed
  recipe. Prompt class: `docs/example-prompts/sas.txt` /
  `conference.txt` / `find-apartment.txt`.
- Start **R2.1** whenever someone can own Magpie + model wiring for durable ticks.
- Optional live checks of already-landed instrumentation: a switched-model chat for
  PERF-01 turn rows; headed `BSA_CHALLENGE_BEHAVIOR=1` on a challenge fixture.

**Do not do yet**

- QUAL-01..06 or PERF-02..09 *behavioral* changes (prompt, tools, model routing,
  perception).
- COST-01.
- Default-on `BSA_CHALLENGE_BEHAVIOR` or `BSA_GATE_EFFECT_AWARE`.
- AGENT-13-T04 (challenge mitigation / profile-pacing experiment).
- AGENT-16-T04 product claim (R3). Compiler tests may start now that T01/T02 exist.
- Treating `goal_mtu4ujai001` as E-QUAL closed.
- Treating R1 as shipped before R1.E2.

---

## R0 — Shipped baseline

Interactive browser agent on a persistent profile. This is what you already run.

### Build

- [x] MVP local Pi + persistent Chromium (D1–D10) — `docs/mvp.md`
- [x] Hosted Pre-V1 (pair, live view, takeover) — `work-items/epics/pre-v1.md`
- [x] V1 product surface (account, helper protocol, harness, page plans) — `work-items/epics/v1.md`
- [x] Bounded agent environment: probe, peek, criteria, gate, AGENT-15 budgets — `work-items/epics/agent.md`
- [x] Jobs V2 **engine** (domain, SQLite, scheduler, dispatcher, CLI `durable …`) — `src/durable/`
- [x] Local Magpie uses installed Chrome; Google sign-in is not rejected by Playwright
      test flags; headed Chrome is driven through the DOM so OS focus stays in the
      editor (PRs #51–#53)
- [x] Magpie goals bind to the Pi session; fruitless coder harvest loops stop;
      operator sees live child progress (PR #54)

### Evaluation (already used)

- [x] Pre-V1 / V1 CI E2E gates (`tests/e2e/pre-v1-e2e-onboarding.test.ts`, `v1-e2e-onboarding.test.ts`)
- [x] Fixture/mock agent suite (no provider in CI)
- [x] Instagram collection baseline `goal_mtrvevpq001` (wandering harvest)
- [x] Berlin checkout `goal_mtt17kx6001` (approvals + challenges; not a collection comparable)
- [x] Operator-guided party-goer rerun (same prompt, venue → tagged → peek) — evidence for D58, not a scored `goal_*`
- [x] Magpie coder harvest `goal_mttviohj001` — not a quality baseline; motivated PR #54
- [x] Additional collection run 1 of 2: `goal_mtu4ujai001` — same Instagram/Minsk
      domain, operator-supplied tagged-feed recipe; only partly comparable. Does
      **not** close E-QUAL.

### Known holes (do not tick as shipped)

- [ ] Valid paid agent-suite baseline (AGENT-01-T02 blocked on credits)
- [ ] AGENT-09 cutover (new core as default) — blocked on that baseline
- [ ] Chat `/job-*` still the **prototype** (`src/jobs`). V2 Pi commands exist and are not bound
- [ ] Durable CLI / Pi adapters still inject `FakeKernel`. Magpie `persistent-host`
      already uses `DirectKernel` + `WorkerBrowserPort`; that is not the product path
      until R2.1–R2.E3
- [ ] Hard delete of `src/jobs` / two L7 job smokes

---

## Track A — Evidence (do not skip)

Independent of coach code. The live-run investigation forbids accepting QUAL/PERF
behavioral changes until this gate is done. **Coach (D58) is not that package**; still
finish this so quality tickets have a second domain.

### E-QUAL — Second comparable collection

Inventory (not the gate):

- [x] Baseline: `goal_mtrvevpq001` (Instagram / Minsk, loose prompt)
- [x] Additional collection 1 of 2: `goal_mtu4ujai001` (same domain, explicit recipe)
- Berlin `goal_mtt17kx6001` and Magpie harvest `goal_mttviohj001` **do not count**

Still required:

- [ ] Live collection run 2 of 2, **different domain** from Instagram
      (SaaS table, conference CFPs, or apartments). Prompt class:
      `docs/example-prompts/sas.txt` / `conference.txt` / `find-apartment.txt`
- [ ] Review filed (`live-run-review-template.md` + evidence-log row)
- [ ] Decision review of QUAL-01..06 and PERF-02..10
      (`docs/live-run-investigation-plan.md` § Decision review)
      Each ticket: accept / experiment / reject / defer — written down, not implied

**Rule:** do not reuse the tagged-feed recipe if the goal is to retest the original
loose collection prompt. Do not ship QUAL/PERF prompt/tool changes before this review.

Decision-review order after the second run: data trust (PERF-01, PERF-10) → QUAL-01..06
→ interaction blockers (PERF-11..13) → loop shape (PERF-02..06) → economics
(PERF-07, PERF-08) → perception (PERF-09).

---

## Landed, gated, not product-default

Code and unit evidence exist. These are **not** R1, **not** E-QUAL closed, and **not**
default operator behavior. Do not treat “landed” as “accepted” or “turn the flag on in
production.”

Vehicle: [PR #55](https://github.com/naiemk/browser-session-agent/pull/55) merged to
`main` 2026-09-09. Behavior flags stay off.

### Instrumentation (safe to use; tickets not accepted)

- [x] **PERF-01** — turn `provider`/`model`, `model_change` events, rollup `byModel`
      (`src/runtime/turn-identity.ts`). Two switched-model live runs still required
      before the ticket is accepted. `goal_mtu4ujai001` had no model switch.
- [x] **PERF-10** — exact probe duplicates keyed by page URL + query;
      `repeatedRecipe` otherwise. One manually validated live sample still required.

### Challenge (AGENT-13) — `BSA_CHALLENGE_BEHAVIOR` default off

Telemetry always. Halt / takeover / park / `blocked.challenge` only when the flag is
`1` or `true`. No CAPTCHA solving, fingerprints, or proxies.

- [x] AGENT-13-T01 — detector + telemetry
- [x] AGENT-13-T02 — high-confidence outcome + host/session breakers (flag on)
- [x] AGENT-13-T03 — interactive halt + Magpie/web takeover; durable park one
      perishable challenge HumanRequest; headed `prepareHuman` / `resumeChallenge` /
      skip ≠ complete
- [ ] AGENT-13-T04 — profile/pacing mitigation experiment (later / gated)
- [ ] Default-on after corpus precision/recall (~98% / ~95% on reviewed observations)
      **and** E-QUAL decision review of PERF-12. Do not enable for the next comparable
      collection run.

### Approval (AGENT-14) — `BSA_GATE_EFFECT_AWARE` default off

- [x] AGENT-14-T01 — ask timestamps, `neverPreapprove` at the gate, flag for
      submits-form
- [x] AGENT-14-T02 — effect envelope / identity matching (flag on)
- [ ] Berlin ask precision/recall matrix
- [ ] Default-on after live comparison (PERF-11)

### Bounded recovery (AGENT-15)

- [x] AGENT-15-T01 — attempt failure stages + no-progress budgets (R0)
- [x] Interactive subagent consecutive-failure / stagnant-harvest stop (PR #54)
- [ ] PERF-13 accepted only after E-QUAL decision review + a comparable live run that
      lowers unsuccessful actions without lowering completion

---

## R1 — Interactive strategy coach

**Operator:** `/plan` authors scout → coach → harvest when the loop is unknown.
Execute runs `/coach` after scout without a second keystroke. Manual `/coach`
mid-run still works. Cheap GLM then loops the guideline. Chat, not jobs.

Spec: [`docs/coach.md`](coach.md) · tickets: AGENT-16-T01..T03, T05
(`work-items/stories/agent-16-strategy-coach.md`)

### Build

- [x] **R1.1** Trajectory digest + yield events — AGENT-16-T01
      (`work-items/evaluations/agent-16-t01-digest.md`)
- [x] **R1.2** Strategy artifact schema (reject spec rewrites) — AGENT-16-T02
      (`work-items/evaluations/agent-16-t02-strategy.md`)
- [x] **R1.3** `/coach` + plan-mode policy text — AGENT-16-T03
      Bind in `src/extension.ts` and `src/hosts/web/runtime.ts`
      (`work-items/evaluations/agent-16-t03-interactive.md`)
- [x] **R1.4** Magpie Execute invokes `/coach` — AGENT-16-T05
      (`work-items/evaluations/agent-16-t05-plan-execute-coach.md`)
      2026-09-10: FakePi. Live harvest following the artifact is R1.E2.

T01 and T02 may proceed in parallel. T03 depends on both. T05 depends on T03.

### Evaluation

- [x] **R1.E1** Unit/FakePi: `tests/unit/coach-digest.test.ts`,
      `coach-strategy.test.ts`, `pi-coach.test.ts` (no provider)
- [ ] **R1.E2** Interactive live: same `party.txt` prompt, `/plan` then Execute
      (T05 host `/coach` after scout). Record yield per site action, navigation
      cycles, peek vs back, accepted-candidate quality vs `goal_mtrvevpq001`.
      `goal_mtumeewm001` does not close this (no `coach-checkpoint`). Append
      evidence-log row.
- [ ] **R1.E3** (optional, after E-QUAL) Same coach flow on the second-domain
      prompt. Confirms the guideline is not Instagram-specific.

### Exit

- [x] Plan-mode context forbids inventing tactic lists; requires scout → coach → harvest
      when the loop is unknown
      2026-09-09: copy is in `PLAN_MODE_CONTEXT`; live planner compliance is R1.E2.
- [x] `/coach` runs with mutations off; harvest sees the rendered artifact, not the digest
      2026-09-09: FakePi. Live harvest following the artifact is R1.E2.
- [ ] R1.E2 shows less wandering than the unguided GLM run (cycles down, yield/action up).
      If not, stop and revise D58 rather than starting R3

**Do not include** AGENT-16-T04 in this release.

---

## R2 — Jobs V2 becomes the product path

**Operator:** `browser-agent durable …` and chat job commands drive SQLite V2 on the
**same Magpie profile**. Prototype `/job-*` is gone or clearly dead.

Tickets: remaining honesty on CAMPAIGN-02-T04 / 04-T01 / 04-T04
(`work-items/epics/v2-campaigns.md`, `docs/jobs-v2-evaluation.md` §3)

### Build

- [ ] **R2.1** Real `ExecutionHost` as the **default product path**: Magpie
      `WorkerBrowserPort` + model loop, not `FakeKernel` in CLI/Pi. Default off
      unless host is attached (`runtime_unavailable`, never fake success).
      2026-09-09: Magpie `persistent-host.ts` already constructs `DirectKernel`;
      `src/durable/adapters/{cli,pi}.ts` still inject `FakeKernel`.
- [ ] **R2.2** Bind V2 in Pi/web (`registerDurablePiCommands` from `extension.ts` /
      hosted runtime). Stop implying prototype jobs will execute
- [ ] **R2.3** Durable attempt path uses AGENT-13/14/15 on a **real host**, with
      evaluation residual on CAMPAIGN-04-T04. Gated detectors already exist; this
      step is attach + L7 evidence, not a second implementation.
- [ ] **R2.4** After R2.E* gates: delete `src/jobs` runner/sprint authority (MIGRATE-03)

R2.1–R2.3 may start while R1 is in flight. **R2.4 waits for evaluations.**

### Evaluation

- [ ] **R2.E1** L5: login on fixture profile → restart control process → same auth;
      stale tab/refs rejected (`docs/jobs-v2-evaluation.md` §3.3)
- [ ] **R2.E2** L6: FakePi + CLI process + due-tick with and without host (nonzero exit
      when host missing)
- [ ] **R2.E3** Two controlled **L7** smokes, no unsafe external commit, each with
      live-run review template
- [ ] **R2.E4** Prototype import/archive dry-run; traceability JSON still maps REQ-IDs
- [ ] **R2.E5** Repo search: no production import of deleted prototype runner

### Exit

- [ ] Chat cannot bind a prototype job as if it will run
- [ ] A due tick without a host is `runtime_unavailable`, not a silent FakeKernel complete
- [ ] MIGRATE-02..04 hard cutover complete

---

## R3 — Job-invoked coach

**Operator:** an approved spec with `coaching.mode = calibration` runs scout, then a
review-phase coach, then harvest. Harvest context is artifact + facts, not the scout
transcript.

Ticket: AGENT-16-T04 · COACH-10..15

**Start compiler/materialize tests as soon as T01/T02 exist. Do not claim the product
until R1 exit and R2.1 exist.**

### Build

- [ ] **R3.1** Optional `coaching` on `WorkflowSpecV2`; materialize scout → coach → harvest
- [ ] **R3.2** Coach attempt: phase `review`, digest in, no `act`
- [ ] **R3.3** Harvest CompiledAttempt includes rendered artifact only (EXEC-04)
- [ ] **R3.4** Rescue yield-breakers (not wall-clock)

### Evaluation

- [ ] **R3.E1** L0: `tests/unit/durable-coaching.test.ts` (compiler, ready-state, no transcript in harvest context)
- [ ] **R3.E2** L2 fixture job: mock kernel consumes digest / emits artifact / unblocks harvest
- [ ] **R3.E3** L7: one live calibration job on a collection prompt (party or E-QUAL domain).
      Same metrics as R1.E2, plus: harvest attempt context size ≪ scout transcript

### Exit

- [ ] Harvest cannot start without a valid artifact (unless operator skip is recorded)
- [ ] Coach cannot mutate; cannot rewrite criteria
- [ ] R3.E3 yield/action no worse than R1.E2 on the same prompt class

---

## R4 — Collection quality (only what E-QUAL accepted)

Do not pre-build QUAL-01..06. After E-QUAL, copy the **accepted** tickets here and tick
them as they ship. Placeholder until the decision review:

- [ ] E-QUAL decision review complete (Track A)
- [ ] Accepted quality tickets implemented (list IDs when known)
- [ ] One comparable live collection **after** those changes; quality vs
      `goal_mtrvevpq001` (fit rate, provenance, count honesty)

Deferred by default until that review: QUAL-01 rubric, QUAL-05 personalization
calibration, PERF-04/05/09 perception. PERF-03 Fabric stays optional R&D
(`docs/fabric-execution-experiment.md`). PERF-08 waits on PERF-01 live evidence.

---

## R5 — Recurring campaigns

**Operator:** a multi-case job discovers subjects, advances them over days, parks on
humans, does not spam (D33).

Product: [`docs/v2-campaigns.md`](v2-campaigns.md)

Requires R2 exit. Benefits from R3 if the discovery step is a harvest.

### Build

- [ ] Recurring `caseMode` proven on Magpie profile (not FakeKernel)
- [ ] HumanRequest rehydration in headed takeover on a **live Magpie job**
      (AGENT-13-T03 code exists behind the flag; this tick is L7 proof, not a rebuild)
- [ ] Pacing / account breakers on the live profile
- [ ] Aggregate oracle on accepted cases, not executor claim

### Evaluation

- [ ] Multi-day smoke (or FakeClock + real browser for the attempt, clock for wait):
      one case parks, another proceeds
- [ ] Cost per **accepted** case reported (OBS-03)
- [ ] Reply/acceptance metric exists; volume-only success is rejected (D33)

### Exit

- [ ] Operator can leave a campaign overnight without an open chat transcript as authority

---

## Later / gated (not a release yet)

Tick into a future R6 only when the entry condition is met.

- [ ] AGENT-01 live suite baseline → then AGENT-09 core cutover
- [ ] AGENT-07-T02 archetype repeat evidence → then memory (AGENT-08)
- [ ] Single-task reliability → then living task graph as authority (AGENT-08 / D28)
- [ ] COST-01 observability gate (`work-items/epics/cost-and-audience.md`)
- [ ] AGENT-13-T04 challenge mitigation experiment (not solving CAPTCHAs)
- [ ] Default-on `BSA_CHALLENGE_BEHAVIOR` (PERF-12 accept + corpus bar)
- [ ] Default-on `BSA_GATE_EFFECT_AWARE` (PERF-11 accept + live comparison)
- [ ] Signed consumer installers as a *distribution* release (V1 code is already in-tree)
- [ ] AGENT-12-T02 Fabric kernel (optional; never a cutover gate)

---

## Suggested near-term sequence (this month)

1. Land **R1.E2** (live coached party.txt after T05) and **E-QUAL**
   (different-domain collection) in parallel. Leave challenge/approval flags **off**
   on comparable live runs.
2. Do not merge QUAL/PERF behavior until E-QUAL's decision review.
3. Do not call coach a product success until R1.E2.
4. Start **R2.1** (CLI/Pi stop using FakeKernel as the product default) as soon as
   someone can own Magpie+model wiring; do not wait for R1.E2.
5. **R3** product claim only after R1 exit + R2.1.

---

## Change log

| Date | What |
| --- | --- |
| 2026-09-09 | Document created. R0 ticked from existing epics; R1–R5 open. |
| 2026-09-09 | R1.1–R1.3 + R1.E1 ticked (AGENT-16-T01..T03). PR #55 on main.
      Next: R1.E2 live coach run and E-QUAL. |
| 2026-09-10 | AGENT-16-T05 opened (R1.4). `goal_mtumeewm001` showed Execute does not
      invoke `/coach`. E2 still open. |
| 2026-09-10 | R1.4 FakePi ticked (AGENT-16-T05). Next: R1.E2 live Execute→coach. |
