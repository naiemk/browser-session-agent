# Evaluation: PARENT-01-T05 cost profiles (R6.4)

Date: 2026-09-12
Implementer: Auto (Composer)
Spec IDs: PARENT-11, PARENT-12
Evidence: L0 `tests/unit/parent-profiles.test.ts`. Provider-free.

## Changes

- `src/host/parent-profiles.ts` — `budget` / `balanced` / `grok` bundles
- `magpie profiles list|recommend|apply` (+ `--apply`) in local CLI
- Recommend prints provider **names** only; no auto-apply

## Spec validation

| Requirement | Status |
| --- | --- |
| Apply budget writes provider/id pins | Pass |
| OpenRouter-only recommend → budget | Pass |
| No sk-/or- in recommend output | Pass |
| `@ultra` rejected via pinError | Pass |
| grok requires xAI auth (or --force) | Pass |

## Open risks

- Concrete model ids track Magpie's OpenRouter preference list; refresh when registry changes.
- RESEARCH-04 still unverified for real xAI subscription pins.
