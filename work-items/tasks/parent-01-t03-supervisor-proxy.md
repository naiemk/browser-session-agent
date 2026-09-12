---
id: PARENT-01-T03
title: OpenRouter supervisor proxy suite (success criteria)
story: PARENT-01
epic: parent-agent
status: todo
---

# PARENT-01-T03 — Supervisor proxy suite

Spec: **PARENT-13**, **PARENT-14**, **PARENT-15**, **PARENT-16**, **PARENT-07**
Authority: [`docs/parent-agent.md`](../../docs/parent-agent.md) §5
This ticket **is** Track B / R6.E2. A real Grok Bot run is not a substitute.

## Goal

Prove, cheaply, that a supervising LLM given the Magpie parent skill will:

- skip Magpie for a tiny lookup;
- delegate a multi-site harvest **once**, with a coarse `plan.md`;
- reuse the same Pi session id for status and instructions.

The live model is **only** the supervisor. Magpie harvest and Chrome are faked.

## Do

1. `npm run test:parent-supervisor` (exact script name may match repo style).
2. Skip (exit 0 with a skip reason) when `OPENROUTER_API_KEY` is unset. Fail CI if
   this script is accidentally wired into default `npm test`.
3. Fake `magpie` on `PATH`: log argv; emit `{ session_id, goal_id, state }` JSON;
   implement `--session` by requiring the id from the previous start. No Playwright.
4. Supervisor: Magpie parent skill (T04 draft may live in this ticket if T04 has not
   landed — a `skills/parent-supervisor/SKILL.md` stub is enough). Tools: command +
   write file only. Default model
   `openrouter/google/gemini-2.5-flash` (override via env).
5. Cases from the spec table: `tiny_lookup`, `harvest_delegate`, `plan_quality`,
   `status_followup`, `instruct_followup`, `no_duplicate`.
6. Caps: fail if estimated USD > **0.25** or supervisor turns > **16**.
7. Traces under `results/parent-supervisor/` (gitignore if the dir is bulky; keep a
   README). Redact keys.

Iterate **skill wording** here when a case fails. That is expected. Do not "fix" a
fail by prompting the test "you must call magpie." The skill is the product.

## Tests

- Provider-free: fake CLI parser + fixture argv assertions (always in `npm test`).
- Live: `test:parent-supervisor` with OpenRouter.

## Done when

The operator can run the live script locally with their OpenRouter key and all six
cases pass under the cap. Evaluation note: `work-items/evaluations/parent-agent/parent-01-t03.md`
(cost, model, date, which skill revision).

## Depends on

PARENT-01-T01 (real flags the fake CLI must mimic), PARENT-01-T02 (plan_quality may
also run admission on the written plan in-process without a second LLM call).
