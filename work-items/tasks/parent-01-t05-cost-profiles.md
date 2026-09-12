---
id: PARENT-01-T05
title: Named cost profiles for worker / plan / coach
story: PARENT-01
epic: parent-agent
status: todo
---

# PARENT-01-T05 — Cost profiles

Spec: **PARENT-11**, **PARENT-12**
Authority: [`docs/parent-agent.md`](../../docs/parent-agent.md), D12,
`src/host/pi-models.ts`

## Goal

Parents can ask the user to pick a Magpie profile so harvest runs on a cheap Magpie
backend, not on Grok Bot conversation credits. Magpie recommends from **authenticated**
providers. No second cost router. No keys in the skill.

## Do

1. Named profiles that set `default` / `plan` / `coach` pins (and document coder
   subagent). Examples: `budget`, `balanced`, `grok` — exact model ids from whatever
   is in the Pi registry at implementation time, not this ticket's guesses.
2. `magpie profiles` (or `/models` extension): list, `recommend`, `apply <name>`.
   Recommend uses `auth.json` + env keys; prints provider **names**, never secrets.
3. Do not auto-apply a paid API-key profile. Print the recommendation; apply on
   confirm or `--apply budget`.
4. Skill (T04) one-time: run recommend, ask the user, apply. Standing rule: after
   delegate, do not browse the harvest yourself.

xAI subscription as a profile waits on RESEARCH-04/05. Until then `grok` profile is
documented as "only if Pi reports xAI authenticated."

## Tests (provider-free)

- Applying `budget` writes `models.json` slots as `provider/id`.
- Recommend with only OpenRouter env mocked → suggests `budget`, not a missing
  Anthropic pin.
- Recommend output has no `sk-` / `or-` key material.
- `@ultra` still rejected as a pin (existing `pinError`).

## Done when

Profiles are operator-selectable and the skill can point at `recommend`. Proxy
suite does not need live profile apply (fake CLI).
