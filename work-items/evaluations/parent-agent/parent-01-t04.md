# Evaluation: PARENT-01-T04 host skills (R6.3)

Date: 2026-09-12
Implementer: Auto (Composer)
Spec IDs: PARENT-08..11, PARENT-07
Evidence: L0 string checks + re-run of R6.E2 against canonical skill.

## Changes

- `skills/magpie-parent/SKILL.md` — canonical CLI contract (from E2-hardened stub)
- `GROK_BOT.md` — paste path (RESEARCH-02; no GitHub URL claim)
- `HERMES_OPENCLAW.md` — same CLI; ACP ids are not the durable handle
- `skills/browser-harness/SKILL.md` — Mode A ACP vs Mode B Magpie Pi-session
- `skills/parent-supervisor/SKILL.md` — E2 runner = canonical + tools appendix

## Live re-check

`npm run test:parent-supervisor` after skill package: **6/6 PASS**, usd≈0.0044,
turns=9, model `openrouter/google/gemini-2.5-flash`.

## Spec validation

| Requirement | Status |
| --- | --- |
| Session-id revive | Pass |
| Forbid click/type | Pass |
| Forbid duplicate start | Pass |
| No parallel harvest | Pass |
| Harness does not default long jobs to ACP | Pass |

## Open risks

- Grok Bot install UX still PARENT-02-T01.
- Skill marketplace packaging beyond paste text is unverified for Bot.
