---
id: AGENT-16-T05
title: Magpie /plan Execute invokes /coach
story: AGENT-16
epic: agent
status: done
---

# AGENT-16-T05 — Magpie `/plan` Execute invokes `/coach`

Spec: **COACH-09**, **COACH-12**, **COACH-13**, **COACH-15**, **COACH-16**, **COACH-17**,
**COACH-19** (FakePi, no provider). D58: auto-coach is invoked by the job **or `/plan`
execution**, plus manual `/coach`.
Authority: [`docs/coach.md`](../../docs/coach.md)

This is the Magpie chat analogue of AGENT-16-T04. **Do not implement T04 here.** Do not
add a harvest `coach` tool. Do not invent a second model router (D12). Do not fire on
wall-clock.

## Goal

After the operator `/plan`s and chooses Execute, Magpie (the Pi extension / hosted
runtime — not GLM) runs the same `handleCoach` path T03 already built, then harvest
continues on the artifact. Hands-off after Execute. The executor never “does” the coach
step.

## Why this ticket exists (evidence)

T03 shipped `/coach` and plan **copy**. It did not wire Execute → `handleCoach`.
`bindCoach` is only registered as slash command `coach`. Plan `turn_end` only marks
`[DONE:n]`.

Live Magpie session `2026-09-09T21-38-26-450Z_01a0881b-9e12-747d-8bca-c7405f68cfd1`,
goal `goal_mtumeewm001`, prompt ≈ `docs/example-prompts/party.txt`:

| Fact | Where |
| --- | --- |
| Planner classified `calibration_required` and wrote scout → coach → harvest | Session `plan-todo-list` 2026-09-09T21:41:02Z |
| Step 4 text (truncated by widget): `Coach: Submit the scout artifact for coaching to turn "popular party ...` | `plan-mode` entry `a6802e74` |
| Execute at 21:41:02Z injected **all seven** remaining steps, including that coach todo | `plan-mode-execute` (later copy at 22:12:41Z is a re-prompt; same list) |
| GLM never emitted `[DONE:n]` during scout | First `[DONE:]` in the session is 22:13–22:14Z, after harvest, on a second Execute |
| After recording scout findings, GLM reasoned there is no coach tool and spawned `subagent({ agent: "planner" })` as a stand-in | Session 21:46:38–21:46:45Z |
| Planner child: DeepSeek Flash, 3 turns, $0.0016; GLM saved the output as `artifacts/harvest-criteria.md` | `payloads.jsonl` turn 65 / 67; event `ev_mtumq8vy05m` |
| No `coach-checkpoint`, no `[COACH REVIEW]`, no T02 strategy artifact | Session + `goal_mtumeewm001` |
| `subagent({ agent: "coach" })` refuse (T03) did not help: GLM used `planner` | Session tool call `agent: "planner"` |

So Magpie **had** the todos and the coach-role wording (COACH-09) and still told the
executor to perform coaching. `[DONE:n]` alone would also have missed this run, because
GLM did not emit it until after the fake coach and harvest.

R1.E2 is not closed by this goal. This ticket is the missing host hook so a later E2
run can be hands-off.

## Fix

Owners: `src/host/pi-plan-todos.ts`, `src/host/pi-plan-mode.ts`, `src/host/pi-coach.ts`,
binds in `src/extension.ts` and `src/hosts/web/runtime.ts`.

1. **Classify plan todos (COACH-09).** Pure helper, e.g. `coachStepIndex(items)`:
   first todo whose text matches `/\bcoach(?:ing)?\b/i` is the coach-role step.
   Pre-coach steps = those with a smaller `step`. Later steps are harvest-phase.
   Fixture the live strings above. Do not NLP beyond that regex. No coach-role todo
   ⇒ known_flow; do not auto-invoke.

2. **Export `startReview` from `bindCoach`** (same body as `/coach` `handleCoach`).
   `CoachHandle` also needs `hasArtifact()` / checkpoint present. Plan-mode must not
   duplicate digest compile, mutation disable, or artifact parse.

3. **Wire the handles.** `bindPlanMode(pi, { coach })` after `bindCoach` in both
   Magpie entrypoints. Today they are siblings and never call each other.

4. **Execute remaining-steps MUST NOT include the coach-role todo** (COACH-15).
   Until a valid `coach-checkpoint` exists, inject only pre-coach steps. Tell the
   executor: after the last of those, emit `[DONE:n]` and **stop**. Do not harvest.
   Do not spawn planner/reviewer/coder as a coach. The host will start review.
   After a checkpoint exists, inject harvest-phase remaining steps; mark the coach
   todo completed in the widget (host-owned, not `[DONE]` from GLM).

5. **When to call `startReview`.** `executionMode`, not already reviewing, no
   artifact yet, a coach-role todo exists, and **every pre-coach todo is
   `completed`** (via existing `markCompletedSteps` on `[DONE:n]`). Call it from
   plan-mode `turn_end` (after marking) and from `agent_end` if Execute is on
   (resume / stop-without-DONE-on-the-last-scout-turn). Same `ExtensionContext` as
   `/coach`. Do **not** wait for `[DONE]` on the coach step.

6. **After a valid artifact** (existing `acceptArtifact`): mark coach todo complete,
   restore operate tools, send harvest remaining-steps with `triggerTurn: true` so
   GLM continues without the operator. Compaction boundary stays T03 (COACH-13).

7. **Manual `/coach` stays.** Mid-harvest still allowed (COACH-16). Auto-invoke is
   skipped if `reviewing` or a checkpoint already exists for this Execute cycle.
   A second auto-invoke on the same plan is forbidden unless the operator `/coach`s
   (rescue is T04).

8. **Clarify spec copy only** in `docs/coach.md` §2.2 / COACH-15: Magpie Execute is
   the interactive scheduler analogue. Do **not** invent a new COACH-* ID.

Out of scope: job materializer (T04); wall-clock / site-action-count auto-coach;
refusing `agent=planner` in general; peek settle; QUAL/PERF behavior.

Residual to name in the evaluation, not to paper over: if GLM never emits `[DONE:n]`
for pre-coach steps, auto-coach still will not fire — but it also must not be able
to *execute* the coach todo. Tighten execute copy so stopping after scout is the
default. Do not add a timer to compensate.

## Tests

Extend `tests/unit/pi-coach.test.ts` (and a few classify cases in `pi-plan-todos` if
that file gets tests). FakePi, no provider (COACH-19).

- Live todo strings: step 4 is coach; steps 1–3 are pre-coach; 5–7 are harvest-phase.
- Execute on that plan: remaining-steps text has Scout / Record, **not** “Coach:
  Submit”, **not** Harvest.
- `turn_end` with `[DONE:1][DONE:2][DONE:3]`: `startReview` equivalent — mutations
  off, digest follow-up / `[COACH REVIEW]`, no `subagent` planner spawn.
- Fake assistant JSON → checkpoint; coach todo completed by host; next Execute
  injection includes Harvest, not a second review.
- Plan with no coach-role todo: Execute does not call review.
- `subagent({ agent: "coach" })` still refused (T03). Do not add a coach tool.

## Depends on

AGENT-16-T03 (landed). Digest/artifact APIs from T01/T02.

## Done when

FakePi: Execute with a calibration plan auto-runs the T03 coach handler after
pre-coach `[DONE:n]`, never leaves the coach step for the executor, and harvest
sees the rendered artifact. Live proof remains R1.E2.
