---
id: AGENT-10-T10
title: Consume-only capped site skill
story: AGENT-10
epic: agent
status: done
---

# AGENT-10-T10 — Consume-only capped site skill

## Spec

- [ideas/site-skills.md](../../ideas/site-skills.md) — consume-only slice; no extract-from-payloads, no record-sandwich
- [docs/decisions.md](../../docs/decisions.md) — D17, D23, D25 (a skill proposes, never authorizes), D8 (opt-in)

## Possible

- `src/runtime/skills.ts` — lazy technique catalogue; site packs empty on purpose
- `src/runtime/card.ts` — known facts already inline

## Do

1. `SiteSkill` object `{ surfaces, can, cannot, dont, stop }` with hard caps on keys, string length, and list length. Unknown keys dropped.
2. Renderer emits a labeled untrusted block for the task card.
3. Load when the operator pastes JSON or a `siteSkill` fact exists — never auto-from a run, never from payloads.
4. Skills never skip the commit gate: a submitting click still parks.

## Tests

- `tests/unit/runtime-site-skill.test.ts` — parse drops unknown keys and over-cap fields; renderer marks untrusted; paste JSON loads.
- Gate assertion in the same file or `tests/e2e/agent-05-commit-gate.test.ts` — with a skill loaded, a submitting click still parks.

## Done when

A pasted skill can appear on the card as untrusted guidance, and it cannot authorize a commit. Org policy and dummy-train remain later.
