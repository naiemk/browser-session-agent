# Release roadmap

Living checklist. Tick boxes here as work lands. Do not rewrite a ticked step; add a
dated note under it if the outcome was partial.

**As of 2026-09-30.** Priority stack: **P0 long-running jobs → P1 important
perf/reliability → P2 computer use (R8).** Evidence runs (R1.E2, E-QUAL) and
chrome (R6 polish, R7) stay valuable; they do **not** own the queue. R8.1
`see` / `use` is in tree. R8.2–R8.5 do not start while P0 and P1 do.

Interactive Magpie chat works. `/plan` Execute leases `/coach` after scout; host
assemble writes the harvest file from remember notes. Clickable perception + unique
chooser (D60) are in tree. R2 engine + Magpie/hosted bind + L5/L6/E4 landed; **R2.E3
open**. R6.E2 green. R7.1 sitemap on `main` (PR #77).

Authority for tickets stays in the specs and work items. This file is the **order and
the gates**, not a second spec.

| Release | What the operator can do | Status |
| --- | --- | --- |
| R0 | Drive a browser from chat; hosted Pre-V1/V1 surface | Shipped |
| R1 | Cheap harvest after a coached loop (`/plan` + `/coach`) | **Build FakePi done; R1.E2 evidence open (not queue head)** |
| R2 | Durable job ticks on the Magpie browser (V2 is the product path) | **P0 — R2.E3 / R2.3 / cutover next** |
| R3 | Job itself schedules scout → coach → harvest | **P0 after R2.E3 path; build may start** |
| R4 | Collection quality tickets that survive the live-run review | After evidence gate E-QUAL |
| R5 | Recurring multi-case campaigns over calendar time | **P0 after R2 exit** |
| R6 | Parent agents delegate via Pi session ids (Grok Bot / Hermes / OpenClaw) | **E2 landed; R6.E3 / exit auth deferred** |
| R7 | Hosted canvas: AG-UI protocol, human slider, scratch tray (not chat-first) | **R7.1 done; R7.2 deferred behind P0/P1** |
| R8 | Harvest switches between browser tools and computer tools | **P2 — R8.1 landed; R8.2–R8.5 behind P0/P1** |

Related: [`docs/coach.md`](coach.md), [`docs/jobs-v2-spec.md`](jobs-v2-spec.md),
[`docs/parent-agent.md`](parent-agent.md),
[`docs/web-ux-sitemap.yaml`](web-ux-sitemap.yaml),
[`docs/jobs-v2-evaluation.md`](jobs-v2-evaluation.md),
[`docs/live-run-investigation-plan.md`](live-run-investigation-plan.md),
[`docs/live-run-evidence-log.md`](live-run-evidence-log.md),
[`docs/challenge-and-approval-handling.md`](challenge-and-approval-handling.md),
[`docs/computer-use.md`](computer-use.md),
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
   gate is ticked. Parallel *build* is allowed for P0/P1. R8.1 landed; R8.2+
   does not start while those own the cycle. Do not let R1.E2, E-QUAL, R6.E3,
   or R7 steal the queue from long-running jobs and named perf wins.

---

## Do this / do not do this

**Do next (priority order)**

**P0 — Long-running jobs**

- **R2.E3** — two controlled L7 smokes on the Magpie profile (live-run review each).
- **R2.3** — AGENT-13/14/15 on a real durable host + CAMPAIGN-04-T04 residual.
- **R2.4** / MIGRATE — delete prototype `src/jobs` authority only after R2.E*.
- **R3** build (compiler / materialize / review-phase coach) once R2.E3 is in flight
  or done; product claim still needs R1.E2 + R2.1.
- **R5** only after R2 exit.

**P1 — Important performance / reliability**

- Landed: D60 clickable controls + unique chooser; host assemble from `facts.json`.
- Next build (does **not** wait on E-QUAL prompt review): **PERF-02** bounds,
  **PERF-06** context rollover, **PERF-07** phase-scoped tool schemas.
- Still collect: PERF-01 switched-model live rows; PERF-10 duplicate-probe sample.

**P2 — Computer use (R8)**

- R8.1 landed (`see` / `use`, fake window port). Spec:
  [`docs/computer-use.md`](computer-use.md) (D61). CU-01-T02..T05 stay behind
  R2.E3 / R2.3.
- Harvest keeps `observe` / `act` and gains `see` / `use`. The tool result
  names the channel. Captcha rounds continue while the widget advances.

**Valuable, not the queue head**

- **R1.E2** live coached `party.txt` (do not treat `goal_mtumeewm001` /
  `goal_mtvqt1a6001` as E2).
- **E-QUAL** second-domain collection + decision review.
- Optional headed `BSA_CHALLENGE_BEHAVIOR=1` fixture checks.

**Do not do yet**

- QUAL-01..06 or PERF perception/prompt tickets (PERF-04/05/09) before E-QUAL
  decision review. PERF-08 waits on PERF-01 live evidence.
- COST-01; default-on challenge/approval flags; AGENT-13-T04.
- Claiming R1 shipped before R1.E2; R2 shipped before R2.E3.
- R6.E3 / Magpie→Grok subscription auth as the next build.
- Building MCP, `@macpie/grok`, or a Magpie daemon ahead of jobs cutover.
- **R7.2** AG-UI import or restyling `app.js` while P0/P1 own the cycle.

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
- [ ] Parent-agent packaging (Pi `--session` as the durable handle) — Track B / R6

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

Spec: [`docs/coach.md`](coach.md) · tickets: AGENT-16-T01..T03, T05, T06
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
      2026-09-10: Host `/coach` fired on `goal_mtvpsym1001` / `goal_mtvqt1a6001`;
      harvest did not consume the loop. Closed loop is T06, not a second E2 attempt
      on T05.
- [x] **R1.5** Magpie closed-loop coach — AGENT-16-T06
      (`work-items/evaluations/agent-16-t06-closed-loop-coach.md`)
      2026-09-10: FakePi. Live harvest following the loop is still R1.E2.
      2026-09-14: COACH-20 prompt after `goal_mtz1c1ar001` (fetch vs JS portals).
      2026-09-15: Occasion frames (scout/steer/close gates). Not E2.

T01 and T02 may proceed in parallel. T03 depends on both. T05 depends on T03.
T06 depends on T05. Do not run E2 until T06 FakePi is green.

### Evaluation

- [x] **R1.E1** Unit/FakePi: `tests/unit/coach-digest.test.ts`,
      `coach-strategy.test.ts`, `pi-coach.test.ts` (no provider)
- [ ] **R1.E2** Interactive live: same `party.txt` prompt, `/plan` then Execute
      **after T06**. Record yield per site action, navigation cycles, peek vs back,
      accepted-candidate quality vs `goal_mtrvevpq001`. `goal_mtumeewm001` (no
      checkpoint) and `goal_mtvqt1a6001` (checkpoint, harvest ignored) do not close
      this. Append evidence-log row.
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

- [x] **R2.1** Real `ExecutionHost` as the **default product path**: Magpie
      `WorkerBrowserPort` + model loop, not `FakeKernel` in CLI/Pi. Default off
      unless host is attached (`runtime_unavailable`, never fake success).
      2026-09-10: CAMPAIGN-R2-1 — `product-host.ts` + `runDurableAttempt`; adapters
      no longer import FakeKernel; `BSA_DURABLE_HOST=1` / `--host` fail closed without
      model or worker. Magpie/hosted chat bind of durable commands: CAMPAIGN-R2-2.
- [x] **R2.2** Bind V2 in Pi/web (`registerDurablePiCommands` from `extension.ts` /
      hosted runtime). Stop implying prototype jobs will execute.
      2026-09-11: CAMPAIGN-R2-2 — Magpie chat ticks use `session.worker` + env-key
      `createLiveModel`; hosted ticks fail closed (no RPC ExecutionHost). Prototype
      `/job-*` remains. R2.E1/E3 still open; do not claim R2 shipped.
      2026-09-12: CAMPAIGN-R2-E2 — hosted ticks use `RpcBrowserPort` when the desktop
      node is connected; disconnected / no-model still `runtime_unavailable`.
- [ ] **R2.3** Durable attempt path uses AGENT-13/14/15 on a **real host**, with
      evaluation residual on CAMPAIGN-04-T04. Gated detectors already exist; this
      step is attach + L7 evidence, not a second implementation.
- [ ] **R2.4** After R2.E* gates: delete `src/jobs` runner/sprint authority (MIGRATE-03)

R2.1–R2.3 may start while R1 is in flight. **R2.4 waits for evaluations.**

### Evaluation

- [x] **R2.E1** L5: login on fixture profile → restart control process → same auth;
      stale tab/refs rejected (`docs/jobs-v2-evaluation.md` §3.3).
      2026-09-11: CAMPAIGN-R2-E1 — detached Chromium + `disconnect()`/`connectOverCDP`;
      Magpie worker L5 test green. Pi-crash orphan Chrome still later; R2.E3 open.
- [x] **R2.E2** L6: FakePi + CLI process + web/RPC twin, due-tick with and without host
      (nonzero exit when host missing). 2026-09-10: CAMPAIGN-R2-1 adapters green;
      2026-09-11: CAMPAIGN-R2-2 Magpie/hosted bind; 2026-09-12: CAMPAIGN-R2-E2 hosted
      `RpcBrowserPort` twin (disconnected node still `runtime_unavailable`).
- [ ] **R2.E3** Two controlled **L7** smokes, no unsafe external commit, each with
      live-run review template
- [x] **R2.E4** Prototype import/archive dry-run; traceability JSON still maps REQ-IDs.
      2026-09-11: CAMPAIGN-R2-E4 — `--dry-run`, malformed quarantine, STORE-06 row
      tightened. Does not complete MIGRATE-02 (R2.E3 still open).
- [ ] **R2.E5** Repo search: no production import of deleted prototype runner

### Exit

- [ ] Chat cannot bind a prototype job as if it will run
- [x] A due tick without a host is `runtime_unavailable`, not a silent FakeKernel complete
      2026-09-10: CAMPAIGN-R2-1 L6
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

## Track B / R6 — Parent-agent Pi sessions

**Operator / parent agent:** start Magpie with a coarse plan, get a **Pi session id**,
leave, later `magpie --session <id> -p` for status or a new instruction. Magpie stays
the browser worker. No daemon. MCP not required.

Spec: [`docs/parent-agent.md`](parent-agent.md) · D59 ·
[`work-items/epics/parent-agent.md`](../work-items/epics/parent-agent.md)

May proceed **in parallel** with R1/R2. Does **not** improve harvest quality and does
**not** tick R1.E2. Success proxy is the OpenRouter supervisor suite, not a live Bot.

### Build

- [ ] **R6.0** RESEARCH-01..09 dump + local Pi `-p` / `--session` canary —
      PARENT-00-T01 (`docs/grok-bot-feasibility.md`)
      2026-09-12: RESEARCH-09 canary pass (Magpie `--json` session + goal round-trip,
      provider-free).
      2026-09-13: citation pass for RESEARCH-01..08 from public docs (Bot MCP still
      unverified; skill install = paste/Plugins/Teach — not GitHub URL). Live
      Bot-computer facts remain for PARENT-02-T01. Do not tick R6.0 fully closed.
- [x] **R6.1** Stable `--session-dir`, print Pi session id, restore `goal_*`, compact
      yield — PARENT-01-T01
- [x] **R6.2** Admit parent `plan.md`; insert scout → coach → harvest when the loop is
      unknown — PARENT-01-T02
- [x] **R6.3** Host skills (Grok Bot / Hermes / OpenClaw), same CLI — PARENT-01-T04
      (iterate copy from R6.E2 failures)
- [x] **R6.4** Named cost profiles (`budget` / …) binding `default` / `plan` /
      `coach` — PARENT-01-T05

R6.1 and R6.2 may proceed in parallel after the RESEARCH-09 canary. R6.3 after E2.
R6.4 may parallel R6.1. Do not polish an installer or MCP before E2.

### Evaluation

- [x] **R6.E1** Provider-free: session-dir / restore goal / admission fixtures
      (`npm test`). PARENT-01-T01, T02.
- [x] **R6.E2** **Success proxy (gate):** `OPENROUTER_API_KEY=… npm run
      test:parent-supervisor`. Fake Magpie CLI, cheap flash/haiku supervisor, no
      Chrome. Cases: tiny lookup not delegated; harvest delegated once with coarse
      plan (no click/type); status + instruct reuse the same session id; no duplicate
      start. Cap USD 0.25 / 16 turns. PARENT-01-T03.
      2026-09-12: 6/6 PASS on `openrouter/google/gemini-2.5-flash`, ≈USD 0.004,
      9–10 turns. Eval: `work-items/evaluations/parent-agent/parent-01-t03.md`.
- [ ] **R6.E3** (optional, after E2) Real Grok Bot computer notes — PARENT-02-T01.
      Does not replace E2.

### Exit

- [x] Client-facing handle is Pi's session id; `--session` restores the Magpie goal
- [x] Parent plan cannot skip Magpie scout/coach on `calibration_required`
- [x] R6.E2 green on a local OpenRouter key
- [x] Default `npm test` still has no provider (D37)
- [x] Skills tell the parent not to harvest in parallel

**Do not include** Magpie→Grok subscription auth as an R6 exit (RESEARCH-04/05/06).
That can follow E2 without blocking the CLI handle.
Do **not** claim R6 shipped until R6.E3 notes (optional) are acknowledged and any
remaining research blockers for operators are documented — product gate was E2.

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

Tick into a later release only when the entry condition is met. R6 is parent-agent
sessions (Track B), already listed above.

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

## R8 — Computer use

**Operator:** during harvest, browser tools and computer tools are both available.
The latest tool result says which one can see the target. Spec:
[`docs/computer-use.md`](computer-use.md). Epic:
[`work-items/epics/computer-use.md`](../work-items/epics/computer-use.md).

P2. R8.1 landed. Do not start R8.2+ while P0 / P1 own the cycle.

### Build

- [x] **R8.1** CU-01-T01 — `see` / `use` / `focus` on harvest only; CDP reattach
      2026-09-30: started because this slice was requested. P0 and P1 still own the queue.
- [ ] **R8.2** CU-01-T02 — one live image, hash gate, caption eviction (D52)
- [ ] **R8.3** CU-01-T03 — tool result names `act` or `see`
- [ ] **R8.4** CU-01-T04 — one vision-pin turn after `no visible change`; then ask
- [ ] **R8.5** CU-01-T05 — captcha continues while the widget advances (D61)

### Evaluation

- [ ] Unit: fake window port, hash gate, channel line, escalation, captcha stop
- [ ] One live harvest that `act`s in Chrome, `use`s another window, returns to
      `observe`, and `remember`s a fact from each side

### Exit

- [ ] Scout and coach never see `see` / `use`
- [ ] A repeated captcha prompt parks for takeover without a new session

Out of this release: app-skill catalog, desktop accessibility tree, set-of-marks.

---

## Track C / R7 — Hosted canvas (AG-UI)

Chrome. Deferred behind P0/P1. Does not replace jobs cutover or named perf.
Sitemap: [`docs/web-ux-sitemap.yaml`](web-ux-sitemap.yaml)
Epic: [`work-items/epics/web-ux.md`](../work-items/epics/web-ux.md)

Today’s hosted UX is chat + command bar + connection pill + live sidebar
(`src/hosts/web/public`). Target is a run **canvas**, a **session rail**, and a
**human slider** (HITL, scratch upload/list/download, closed-catalog surfaces).
Chat becomes a dock. AG-UI is the event protocol; CopilotKit is not the app;
`threadId` is Pi `goal_*`.

### Build

- [x] **R7.1** WEB-01-T01 — sitemap YAML + AG-UI mapping + closed catalog
- [ ] **R7.2** WEB-01-T02 — import `@ag-ui/core` + encoder; coder `--skill`; no
      scratch `npm install`
- [ ] **R7.3** (later story) — implement shell regions; `ui_request` leaves chat
      cards for the slider

### Evaluation

- [x] Unit: sitemap names rail, canvas, slider, scratch, catalog deny list
- [ ] T02: coder argv has `--skill`; fixture JSONL encodes without cwd install

### Exit (not this PR)

- [ ] Operator can upload a file, see a coder table on the canvas, and answer a
      gate on the slider without opening the transcript dock

Do **not** claim R7 shipped at T01. Do **not** restyle `app.js` before T02.

---

## Suggested near-term sequence (this month)

1. **P0:** **R2.E3** L7 smokes, then **R2.3** real-host challenge/approval attach.
   Do not claim R2 shipped; do not **R2.4** delete until R2.E*.
2. **P0 parallel build:** **R3** compiler/materialize when R2.E3 is underway.
   Product claim still waits on R1.E2 + R2.1.
3. **P1:** ship loop/cost wins — PERF-02, PERF-06, PERF-07 — plus PERF-01/10 live
   samples. Keep QUAL and perception/prompt PERF gated on E-QUAL review.
4. **P2 / R8:** R8.1 landed. Do not start R8.2–R8.5 while P0 and P1 are open.
5. Evidence when capacity allows (not queue head): **R1.E2**, **E-QUAL**. Leave
   challenge/approval flags **off** on comparable live runs.
6. Deferred: R6.E3 notes, **R7.2** AG-UI import. Do not restyle chat ahead of T02.
7. **R5** only after R2 exit.

---

## Change log

| Date | What |
| --- | --- |
| 2026-10-01 | R8.1 `see` / `use` lands on harvest, with CDP reattach. R8.2–R8.5 stay behind P0 and P1. |
| 2026-09-30 | R8.1 CU-01-T01 started (`see` / `use`, fake window port). The
      rest of R8 stays behind P0 and P1. |
| 2026-09-30 | R8 computer use named as P2 (`docs/computer-use.md`, D61,
      CU-01-T01..T05). Still behind P0 jobs and P1 perf. Captcha progress
      replaces the blanket solver ban. |
| 2026-09-30 | Re-prioritized: P0 long-running jobs (R2.E3/R2.3 → R3 → R5), P1
      perf (D60/assemble landed; PERF-02/06/07 next), P2 next-idea placeholder.
      R1.E2 / E-QUAL / R6.E3 / R7.2 deferred from queue head. |
| 2026-09-09 | Document created. R0 ticked from existing epics; R1–R5 open. |
| 2026-09-09 | R1.1–R1.3 + R1.E1 ticked (AGENT-16-T01..T03). PR #55 on main.
      Next: R1.E2 live coach run and E-QUAL. |
| 2026-09-10 | AGENT-16-T05 opened (R1.4). `goal_mtumeewm001` showed Execute does not
      invoke `/coach`. E2 still open. |
| 2026-09-10 | R1.4 FakePi ticked (AGENT-16-T05). Next: R1.E2 live Execute→coach. |
| 2026-09-10 | R2.1 L6 ticked (CAMPAIGN-R2-1). Adapters no longer FakeKernel-complete.
      Next R2 build: R2.2 Magpie/web bind. R2.E1/E3 still open. |
| 2026-09-11 | R2.2 L6 ticked (CAMPAIGN-R2-2). Magpie/hosted durable commands bound;
      hosted ticks fail closed. R2.E1/E3 still open; do not claim R2 shipped. |
| 2026-09-11 | R2.E1 L5 ticked (CAMPAIGN-R2-E1). Magpie CDP client reconnect on fixture
      profile. R2.E3/E4 still open; do not claim R2 shipped. |
| 2026-09-12 | R2.E2 L6 completed (CAMPAIGN-R2-E2). Hosted ticks use RpcBrowserPort when
      the node is connected. R2.E3/E4 still open; do not claim R2 shipped. |
| 2026-09-12 | Track B / R6 parent-agent sessions added (D59, `docs/parent-agent.md`).
      Gate is OpenRouter supervisor proxy (PARENT-01-T03), not a live Grok Bot run. |
| 2026-09-12 | R2.E4 ticked (CAMPAIGN-R2-E4). Prototype dry-run + STORE-06 quarantine
      rebased onto main. R2.E3 still open; do not claim R2 / MIGRATE-02 hard cutover. |
| 2026-09-12 | R6.1 / R6.2 / R6.E1 ticked (PARENT-01-T01, T02). Magpie `--json` session
      handle + L0 plan admission. RESEARCH-09 canary noted under R6.0. R6.E2 /
      skills / cost profiles / R6 exit still open; do not claim R6 shipped. |
| 2026-09-14 | COACH-20: `goal_mtz1c1ar001` cheap-fetch vs JS portals. Coach
      prompt + harvest hint escalate shells/unknown fields to observe. Not R1.E2. |
| 2026-09-16 | Track C / R7 hosted canvas. WEB-01-T01 sitemap YAML + AG-UI
      mapping (`docs/web-ux-sitemap.yaml`). R7.2 import still open. Not R1.E2. |
