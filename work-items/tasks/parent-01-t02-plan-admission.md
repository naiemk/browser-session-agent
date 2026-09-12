---
id: PARENT-01-T02
title: Admit parent plan; insert scout/coach when needed
story: PARENT-01
epic: parent-agent
status: done
---

# PARENT-01-T02 — Parent plan admission

Spec: **PARENT-05**, **PARENT-06**, **PARENT-07** (admission half)
Authority: [`docs/parent-agent.md`](../../docs/parent-agent.md), D58 / [`docs/coach.md`](../../docs/coach.md)
Pattern: `src/host/pi-subagent/agents/planner.md` (`plan.md` shape),
`standingPlanPrompt` in `src/host/pi-subagent/bind.ts`

## Goal

A parent writes a coarse `plan.md`. Magpie does not open `/plan` in the TUI for this
path. Magpie classifies the objective and **inserts** scout → coach → harvest when
the loop is unknown. Click/type/CSS in the parent plan is not executed.

## Do

1. Accept `--plan-file` and/or `@plan.md` as Layer 1 (goal, missing inputs, numbered
   steps with worker kinds, stop, digest). Reuse the existing planner headings where
   they fit; do not require Jobs V2 spec JSON.
2. Classifier: `calibration_required` | `known_flow` | `criteria_unsettled` (COACH-09
   copy, keep it short). Heuristic is allowed at L0 (keywords / step count / "many
   entities"); do not call a provider in this ticket's tests.
3. For `calibration_required`, rewrite/annotate the admitted plan so scout, coach, and
   harvest are explicit even if the parent omitted them. Parent tactics like "then
   scrape 200 profiles" do not skip scout.
4. For `known_flow` (single short reversible flow), do not add a coach step.
5. For `criteria_unsettled`, status is blocked / ask — do not harvest.
6. Strip or ignore parent steps that look like `click(selector)` / CSS / "type into".
7. Write the admitted plan to the goal scratch (`plan.md`) so operate/harvest follows
   it (`standingPlanPrompt`).

Do not reimplement `/coach`. Admission only schedules the steps D58 already defined.

## Tests (provider-free)

- Harvest-shaped objective + parent plan **without** scout/coach → admitted plan
  contains scout, coach, harvest in that order.
- JSONLint-class / single known flow → no coach step.
- Parent plan containing `click(` or a CSS selector → those steps are not in the
  admitted operate list (stripped or rejected with a recorded reason).
- `criteria_unsettled` (empty success criteria, "figure out what we want") → no
  harvest start.

## Done when

L0 tests lock admission. T01 can pass `@plan.md` into start. T03 asserts the
**parent** wrote a coarse plan; this ticket asserts **Magpie** fixed it.
