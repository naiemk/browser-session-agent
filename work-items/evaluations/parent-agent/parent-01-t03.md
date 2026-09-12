# Evaluation: PARENT-01-T03 supervisor proxy (R6.E2)

Date: 2026-09-12
Implementer: Auto (Composer)
Spec IDs: PARENT-13..16, PARENT-07
Evidence: opt-in live `npm run test:parent-supervisor` + L0 fake-CLI tests.
Do not claim R6 shipped. Do not claim live Grok Bot.

## Discovery

- Default `npm test` must stay provider-free; supervisor is a separate script.
- Fake Magpie must mimic T01 `--json` / `--session` / `--plan-file` without Chrome.
- Skill wording is the product: `instruct_followup` initially started a second session
  until refinements were defined as `--session … -p` instructions.

## Changes

- `tests/helpers/fake-magpie.ts` + `bin/fake-magpie.mjs`
- `scripts/parent-supervisor.ts` + `npm run test:parent-supervisor`
- `skills/parent-supervisor/SKILL.md` (stub iterated for E2)
- Fixtures under `tests/fixtures/parent-supervisor/`
- `docs/grok-bot-feasibility.md` citation pass (RESEARCH-01..08)

## Live run

| Field | Value |
| --- | --- |
| Date | 2026-09-12T21:08:37Z |
| Model | `openrouter/google/gemini-2.5-flash` |
| USD | ≈ 0.0038 (cap 0.25) |
| Supervisor turns | 10 (cap 16) |
| Skill revision | `skills/parent-supervisor/SKILL.md` (refinement = instruct, not restart) |
| Traces | `results/parent-supervisor/2026-09-12T21-08-37/` (gitignored dumps) |

| Case | Result |
| --- | --- |
| tiny_lookup | Pass |
| harvest_delegate | Pass |
| plan_quality | Pass |
| status_followup | Pass |
| instruct_followup | Pass |
| no_duplicate | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 2 | 4 | Six cases green after skill iterate |
| Boundaries | 4 | 4 | Fake CLI; no Chrome; not in `npm test` |
| Concurrency / crash | 3 | 3 | Temp HOME per run |
| Safety / privacy | 4 | 4 | Key redaction; skip if unset |
| Observability | 3 | 4 | Trace dir + summary |
| Perf/cost | 3 | 4 | Flash model; hard USD/turn caps |
| Test realism | 3 | 4 | Real OpenRouter supervisor |
| Maintainability | 3 | 4 | Skill stub is the iterate surface |

## Improvement pass

- Skill: refinements ("ignore agencies") must use `--session … -p`, never a second
  `--json` start while a session is live.

## Open risks / follow-ups

- R6.3 ships the hardened skill to Grok/Hermes/OpenClaw packages.
- R6.4 profiles so the skill can point at `magpie profiles recommend`.
- R6.E3 live Bot install still open.
