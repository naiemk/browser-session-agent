# Evaluation: PARENT-01-T02 plan admission

Date: 2026-09-12
Implementer: Auto (Composer)
Spec IDs: PARENT-05, PARENT-06, PARENT-07 (admission half)
Evidence: L0 `tests/unit/parent-plan.test.ts` + L6 CLI plan-file seam in
`tests/unit/parent-session.test.ts`. Provider-free. Does not reimplement `/coach`.

## Discovery

- Planner headings already exist in `pi-subagent/agents/planner.md`; scratch consumption
  via `standingPlanPrompt` / `ensureScratch`.
- Parent plans can list bulk scrape tactics before Magpie scout/coach — admission must
  insert phases and must not execute click/type/CSS.
- Classifier is L0 heuristic only (`calibration_required` | `known_flow` |
  `criteria_unsettled`).

## Changes

- `src/host/parent-plan.ts` — admit, classify, strip procedures, write `scratch/plan.md`
- Wired from `cli.ts` on `--json` start (`--plan-file` / `@plan.md`)

## Initial evidence

```bash
npx tsx --test tests/unit/parent-plan.test.ts
```

6 pass / 0 fail.

Highest evidence level claimed: **L0** (+ L6 CLI seam via T01).

## Spec validation

| Requirement | Status |
| --- | --- |
| Harvest-shaped without scout/coach → scout → coach → harvest | Pass |
| JSONLint-class known_flow → no coach step | Pass |
| `click(` / type into stripped | Pass |
| `criteria_unsettled` → blocked, no plan write | Pass |
| Writes goal scratch `plan.md` | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 2 | 4 | Phase order; deferred parent tactics; digest wording |
| Boundaries | 4 | 4 | No `/coach`, no provider |
| Concurrency / crash | 3 | 3 | Single scratch write |
| Safety / privacy | 3 | 3 | Strips click/CSS; blocks unsettled |
| Observability | 3 | 4 | Admission marker + deferred notes |
| Perf/cost | 4 | 4 | Pure heuristic |
| Test realism | 3 | 4 | Four ticket cases + CLI plan-file |
| Maintainability | 3 | 4 | One L0 module; planner headings reused |

## Improvement pass

- Parent bulk tactics ("scrape 200 profiles") moved to **deferred notes**, not Plan
  operate steps, so they cannot skip scout/coach.
- Phase assembly always emits scout → coach → harvest in that order (reuse parent
  wording when present).
- Admission digest / stop copy no longer poison order assertions with early
  "harvest"/"coach" tokens.

## Requirement coverage

PARENT-05..07 → `parent-plan.ts`, `parent-plan.test.ts`, CLI `--plan-file` path.

## Open risks / follow-ups

- Heuristic classifier will mis-label edge objectives; T03/skills iterate copy.
- Does not claim R6.E2 or live coach execution.
