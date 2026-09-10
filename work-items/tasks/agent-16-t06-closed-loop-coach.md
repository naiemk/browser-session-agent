---
id: AGENT-16-T06
title: Magpie closed-loop coach
story: AGENT-16
epic: agent
status: done
---

# AGENT-16-T06 — Magpie closed-loop coach

Spec: **COACH-03**, **COACH-06**, **COACH-07**, **COACH-11** (Magpie Execute analogue,
not the job compiler), **COACH-12**, **COACH-13**, **COACH-15**, **COACH-16**,
**COACH-19**. D58. D12 (no second router). D25 (artifact proposes, never authorizes).
D52 (coach is a compaction boundary).
Authority: [`docs/coach.md`](../../docs/coach.md)

T05 made Magpie **lease** `/coach` after scout. This ticket makes the critic **and**
harvest a closed loop so a live `/plan` Execute can close **R1.E2**. **Do not
implement T04** (job `CoachingPolicy`, materializer, ContextCompiler). Do not add a
harvest `coach` tool. Do not invent a second model router. Do not fire on wall-clock.
Do not teach Instagram tactics. Do not pull PERF-04/05 (peek extract, dialog scroll)
into this ticket.

T05 residual that this ticket **reverses for Magpie only:** “a second auto-invoke on
the same plan is forbidden unless the operator `/coach`s (rescue is T04).” Magpie
rescue is in scope here. Jobs rescue stays T04 / R3.

## Goal

Hands-off after Execute: Magpie (not GLM) runs review on a **stronger class**, harvest
**tries the named loop until it is falsified**, records **yield**, and if it wanders
Magpie **coaches again** from the harvest digest. The first artifact is a **trial**,
not a lock. Live proof is R1.E2 vs `goal_mtrvevpq001`. Invocation-only runs below do
not close this ticket.

## Why this ticket exists (evidence)

Operator-guided venue → tagged → peek already showed the *idea* works
(`docs/live-run-evidence-log.md`, D58). Cheap GLM without a critic wanders
(`goal_mtrvevpq001`: 417 turns, 0 `peek`, 24/200, later called success). T05 FakePi is
green and live host `/coach` has fired. Harvest still does not consume the guideline,
the critic is the same Flash model, and nothing watches the wander. Potential is
proved; practice is not.

| Run | What happened | Closes |
| --- | --- | --- |
| `goal_mtrvevpq001` (unguided baseline) | 417 turns, 234 `act`, 0 `peek`, 24/200, no strategy layer | Comparison target for R1.E2, not a coach run |
| `goal_mtumeewm001` · session `2026-09-09T21-38-26` | T03 copy only. Execute injected the coach-role todo. GLM spawned `subagent({ agent: "planner" })`. No `coach-checkpoint` | Motivated T05. Does **not** close E2 |
| `goal_mtvp15fx001` · session `2026-09-10T15-39-53` | T05 still sent **two** Execute follow-ups: `plan-todo-list` (full scout → coach → harvest, including “Run /coach”) then scout-only `plan-mode-execute`. Pi started the first. GLM never stopped, never saw scout-only, spawned planner. No `[COACH REVIEW]` | Kickoff race. Local one-message fix exists in `src/host/pi-plan-mode.ts` + `tests/unit/pi-coach.test.ts` (“Execute starts one scout-only turn…”). **Not on `main`.** Land it here |
| `goal_mtvpsym1001` · session `2026-09-10T16-01-30` | First real Magpie `[COACH REVIEW]`. First JSON **rejected** `spec_rewrite` because `/follower threshold/i` matched assumptions (“no explicit follower threshold”). Retry accepted. Harvest still main-tab navigated instead of peek | COACH-06 regex hole. Invocation worked |
| `goal_mtvqt1a6001` · session `2026-09-10T16-29-33` | Scout-only Execute → Magpie `/coach` → JSON accepted → harvest. Artifact: stay in venue **followers modal**, **peek**, record `candidate_*`, do not main-tab navigate, falsify = two empty lists. Harvest: spawned **coder** (`curl` hashtag HTML), then **commenter mining**, **43** harvest profile navigates, **37** consecutive hops, **0** harvest side tabs, **0** `candidate_*` yields. `report` blocked, **11 of 200**, “session capacity.” Coach turn was the **same GLM** as harvest. Digest `goal`/criteria were not the approved plan slice. Scout transcript remained in context (COACH-13 not actually dropped). Agent later measured followers ~8% (1/13) vs commenters ~45% (5/11) — rates the first coach never saw | **Does not close E2.** Control: coach *fired* and harvest *ignored*. Also: first coach ran too early to know the paying pool |

`mtvqt1a6001` is the shape this ticket exists to kill:

1. **Sticky note, not a gate.** Artifact is consume-only prose (`STRATEGY … untrusted`).
   Card still says the route is the executor’s. `subagent` / `coder` stay available.
   `falsify` is never evaluated. T05 forbids a second host coach.
2. **Critic underpowered.** Same session model as harvest. `bindCoach` uses the generic
   chat objective and empty `criteria`. `previousArtifact.followed` is hardcoded
   `true`. Zero harvest yields → digest cannot compare pools.
3. **First coach overfits n≈9.** `doNot` / “the reliable route” forbade the denser
   list harvest later found. Early calibration is still right (do not scale on a
   guess). Treating that JSON as the *only* strategy is wrong.
4. **Peek advice is locally expensive.** Scout peek snapshots were thin; `act`
   identity stats were not. PERF-04/05 stay out of this ticket. Success here is
   **try the loop or falsify → rescue**, not “200 peeks from a broken followers
   modal.”

## Fix

Owners: `src/host/pi-plan-mode.ts`, `src/host/pi-plan-todos.ts`, `src/host/pi-coach.ts`,
`src/host/pi-subagent/bind.ts`, `src/host/pi-compaction.ts` (invoke, do not rewrite
D52), `src/runtime/coach/strategy.ts`, `src/runtime/coach/digest.ts` (only if digest
inputs are wrong), `src/runtime/tools.ts` / harvest execute copy for yield,
`src/extension.ts`, `src/hosts/web/runtime.ts`. Spec copy only in `docs/coach.md`
§2.2 / COACH-11 / COACH-12 / COACH-13: Magpie Execute rescue and host-requested
stronger class. **Do not invent a new COACH-\* ID.**

Land in this order. Do not start the live run until 1–6 have FakePi.

1. **One Execute follow-up (T05 race).** Execute sends **only** scout-only
   `plan-mode-execute`. Do not also `sendMessage` a `plan-todo-list` that includes the
   coach-role / harvest todos — that text starts the Pi turn and the scout-only
   message queues until GLM stops. Widget may still show Coach/Harvest as later
   steps. The local uncommitted patch is the intended shape; finish and merge it.

2. **No fake coach while awaiting host review (COACH-15).** While
   `awaitingHostCoach()` (execution on, coach-role todo exists, no artifact), Magpie
   MUST remove `subagent` from the active set (same disable set as plan-mode / coach
   review), not only refuse `agent=coach`. Refusing the name `coach` did not stop
   `planner`. After the artifact, restore harvest tools including `subagent`.

3. **Scout that never emits `[DONE:n]` still coaches.** Keep the existing
   `preCoachComplete` + `agent_end` path. Add: `agent_end` while `awaitingHostCoach()`
   after the scout-only execute, if the scout produced any `route_affordance` /
   `fact_established` yield **or** any pre-coach todo is already `[DONE]`, call
   `startReview`. Empty first puff (no tools, no yield) MUST NOT coach. **No
   wall-clock.** FakePi the remember-without-DONE case.

4. **Stronger class for the review turn (COACH-12).** The host MAY request a high/ultra
   class for coach; Magpie MUST, when the Pi API can switch model or thinking level.
   Restore the previous class in `disableReview` / after accept or abort. Use the
   existing Pi selector (`setModel` / thinking level on the host). **Do not** hard-code
   a vendor model id. **Do not** add a Magpie model catalog. If local Magpie cannot
   switch class at all, stop and escalate — do not ship “notify Ctrl+P” again and call
   COACH-12 done (that is T03). FakePi: spy request + restore; no provider.

5. **Digest is the approved plan, not chat leftovers (COACH-02).** `bindCoach` MUST
   receive the operator objective and criteria from the `/plan` / Execute session, not
   the generic “Help the operator…” card. `compileSessionDigest` MUST NOT use the last
   user chat line as `goal` when a plan objective exists. `criteria` MUST be the
   immutable success slice when known. `previousArtifact.followed` MUST NOT be
   hardcoded `true`: unknown or false when harvest recorded zero `candidate_*` since
   the last checkpoint.

6. **First artifact is a trial (COACH-06, COACH-07).** Coach instructions + harvest
   remaining-steps: try the named loop, record after every candidate, **stop for
   Magpie on `falsify`** — do not invent a second plan, do not treat `doNot` as
   covering **untested** pools. Fix `SPEC_REWRITE`: `/follower threshold/i` MUST NOT
   reject “do not change the follower threshold” / “no explicit follower threshold”
   in assumptions. A real criteria rewrite (lower the bar, skip approval, grant send)
   MUST still reject. `doNot` may name wasted routes **already in the digest**; it
   MUST NOT be a lock on a denser list the scout never tried.

7. **Yield is harvest progress (COACH-03).** Harvest execute copy requires
   `remember` with `candidate_accepted` / `candidate_rejected` / `candidate_duplicate`
   after every qualified peek/inspect. Clicks that return `ok` still are not yield.
   Do not make scout-only `fact_established` illegal.

8. **Compaction boundary is real (COACH-13).** After a valid checkpoint, harvest
   context is spec slice + criteria + facts + **rendered artifact** + current page.
   Drop scout snapshots / tool-result dumps. **Do not drop the artifact.** Reuse
   `compactPiContext` / D52; do not invent a second pruner. Harvest `before_agent_start`
   MUST NOT still carry scout peek/act JSON.

9. **Magpie rescue (COACH-11 analogue).** After the first artifact, Magpie watches
   **yield breakers since the last checkpoint**, not elapsed time:
   - named constant for site actions without a new `candidate_*` (document it; fixture
     it; do not hide a timer behind “actions”)
   - navigation cycles / `lost_place` from the digest
   On trip: pause harvest (mutations off, same as `/coach`), `startReview` again on
   the stronger class, new artifact replaces the previous (already in T03 copy). A
   **second** rescue with no new yield **and** no new accepted artifact **halts** for
   the operator (AGENT-15 / EXEC-07 spirit). Manual `/coach` still allowed (COACH-16).
   Wall-clock MUST NOT be a trigger.

Out of scope: T04 job policy; QUAL/PERF behavioral package; peek observation fusion;
dialog scroll; Instagram-specific product code; replacing AGENT-15 breakers; cargo-cult
coach on `known_flow` plans.

## Tests

Extend `tests/unit/pi-coach.test.ts` and `tests/unit/coach-strategy.test.ts`. FakePi,
no provider (COACH-19). Fixture the live failures above, not a new Instagram recipe.

- Execute emits **one** `plan-mode-execute` (scout-only) and **zero**
  `plan-todo-list` follow-ups that include Coach/Harvest. Widget still lists Coach.
- While `awaitingHostCoach()`, `subagent` is not in `getActiveTools()`. After
  artifact, it is back. `agent=coach` still refused.
- Scout `remember` `route_affordance` + `agent_end` **without** `[DONE:n]` starts
  `[COACH REVIEW]`. Tool-less first `agent_end` does not.
- FakePi records a stronger-class request at `startReview` and restore after accept.
- Digest `goal` / `criteria` match the plan objective fixture, not “Help the operator.”
- Artifact JSON with assumptions “no explicit follower threshold” **accepts**. Artifact
  that says to lower the follower bar or DM without approval **rejects**.
- Harvest injection after checkpoint contains rendered STRATEGY and does **not**
  contain a scout snapshot dump / `controls:` blob.
- N site actions, zero `candidate_*` since checkpoint → second `[COACH REVIEW]`.
  Elapsed-ms-only fixture MUST NOT start review. Second rescue with no new yield and
  no new artifact → halt notify, no third silent review.
- `previousStrategy.followed` is not `true` when harvest yields are zero.

## Reviewer

Review the **invariants**, not the file list. A green FakePi that still leaves harvest
as a chat with a sticky note is a reject. After this change, all of the following
must be true. Cite a failing bullet, not taste.

### Must still be true (do not regress)

1. **Host leases review.** The executor has no `coach` tool. Magpie Execute / `/coach`
   / rescue call the same `handleCoach`. GLM must not be able to “do” the coach step
   by remaining-steps text or by spawning `planner` / `reviewer` / `coder` as a
   stand-in while awaiting the first artifact.
2. **One kickoff message.** Execute starts **one** model turn whose user-visible
   remaining-steps are scout-only. A hidden or queued second message that contains
   “Run /coach” / Harvest is a T05 race regression (`goal_mtvp15fx001`).
3. **No second router (D12).** No Magpie model catalog, no hardcoded vendor ids
   (`gpt-…`, `claude-…`, `glm-…` as the coach model). Stronger class goes through
   Pi’s existing selector. Session class is restored after review. “Notify Ctrl+P”
   alone is T03, not this ticket.
4. **No wall-clock coach.** Rescue and the DONE-fallback are yield / cycle /
   `agent_end` after scout evidence. An `elapsedMs` / `setTimeout` / “every N minutes”
   path is a spec violation (COACH-11, T05, this ticket).
5. **Artifact cannot rewrite the spec (COACH-06, D20).** Fixing the `/follower
   threshold/i` false positive MUST NOT start accepting “lower the bar,” skip
   approval, `grant`, or send/follow. Review the regex/blob, not just the new happy
   fixture.
6. **Untrusted guidance (D25, COACH-07).** STRATEGY still cannot skip postconditions,
   authorize commits, or be used as a selector. Rescue and harvest copy may **require
   trying the loop until falsify**; they may not make the artifact an authority that
   bypasses the live page.
7. **Digest ≠ transcript (COACH-01).** Coach prompt state is still the capped digest.
   Rescue does not dump the harvest chat. Tests that send a transcript fail the spec.
8. **Compaction keeps the artifact, drops scout dumps (COACH-13, D52).** Harvest
   context after checkpoint is spec + facts + rendered artifact + page. If scout
   peek/act JSON is still in `before_agent_start` / compacted messages, COACH-13 is
   not done. If the STRATEGY custom message is gone, that is also a fail.
9. **Yield kinds exist and harvest is told to use them (COACH-03).** Do not remove
   optional `remember.yield`. Do not treat tool `ok` as a candidate accept.
10. **Jobs V2 cutover untouched.** No `CoachingPolicy` on the spec, no materializer
    graph, no ContextCompiler harvest attempt in this PR. That is T04. Magpie rescue
    is allowed to **look like** COACH-11 without living in `src/durable/`.
11. **No site-specific product code.** No Instagram, Tagged, followers-modal, or
    party-goer recipe in `src/`. Coach instructions stay task-agnostic (stay on the
    list, peek, record, falsify, do not invent a second plan).
12. **AGENT-15 still stops no-progress.** Rescue diagnoses *route*. It does not
    replace failure budgets. A second empty rescue **halts for the operator**; it
    does not loop coach forever.

### Concepts that must be valid in the result

| Concept | Valid meaning after this PR | Invalid (reject) |
| --- | --- | --- |
| **Calibration (first coach)** | After a tight scout: trial loop, demand yields, name `falsify`, do not scale yet | Only coach in the run; `doNot` locks untested pools; harvest may ignore it |
| **Rescue (later coach)** | Host re-leases review when harvest wastes *successful* actions (no new `candidate_*`, navigation cycles) | Timer; operator-only `/coach`; “second auto-invoke forbidden” leftover from T05 |
| **Trial artifact** | Harvest must try it until falsify or breaker, then stop for Magpie | Consume-only sticky note next to “the route is yours” with no breaker |
| **Followed** | Digest can say the last guideline was **not** followed (zero `candidate_*`, cycles) | `previousArtifact.followed: true` hardcoded |
| **Stronger class** | Review turn is a higher Pi class/thinking than harvest, then restored | Same GLM; comment in the notify string only |
| **Plan slice in the digest** | `goal` + `criteria` are the approved harvest spec | Generic Magpie card objective; last `ask_user` reply as `goal` |
| **Awaiting host coach** | Scout-only tools; `subagent` **absent** | `subagent` present, `agent=coach` refused, `planner` allowed |
| **Halt** | Second rescue, no new yield, no new artifact → operator | Silent third review; harvest continues anyway |
| **R1.E2** | Live party Execute after this lands; compare wander vs `goal_mtrvevpq001` | Claiming E2 on `mtvqt1a6001` / `mtvpsym1001` / FakePi |

### What a reviewer should open

- Execute kickoff in `bindPlanMode` (message count, `triggerTurn`, customTypes).
- Active tool set in `awaitingHostCoach()` vs review vs harvest.
- `startReview` call sites (`turn_end`, `agent_end`, rescue). Confirm none are
  time-based.
- `disableReview` restores tools **and** model/thinking class.
- `compileSessionDigest` goal/criteria/followed.
- `SPEC_REWRITE` vs the `mtvpsym1001` false-positive string and a real rewrite.
- Compaction after `acceptArtifact`: artifact present, scout snapshots gone.
- Rescue counters: since **checkpoint**, `candidate_*` only, halt on the second miss.

## Depends on

AGENT-16-T05 (landed). Digest/artifact APIs from T01/T02. T03 `/coach` handler. **Not**
T04.

## Done when

FakePi covers the tests above. Evaluation file names the residuals (peek too thin,
dialog scroll) without papering over them. **Live R1.E2** is a `/plan` then Execute
on `docs/example-prompts/party.txt` (no tagged/peek paste) after this merge:

- `coach-checkpoint` after scout (not `subagent planner`)
- Coach turn on a stronger class than harvest
- Harvest `candidate_*` yields
- Harvest either stays on the named list **or** hits `falsify` / a yield breaker and
  gets a **second** coach — not a silent second plan
- Wandering down vs `goal_mtrvevpq001` (cycles down, yield per site action up)

Volume to 200 is **not** the gate. `goal_mtvqt1a6001` and `goal_mtvpsym1001` do **not**
close this. If FakePi is green and the live run still ignores two artifacts, this
ticket is not done — do not start R3.
