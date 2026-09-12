# Epic: Parent-agent sessions

Status: **in progress (R6.1/R6.2/R6.E1).** Direction D59. Spec: [`docs/parent-agent.md`](../../docs/parent-agent.md).
Does not block R1.E2 or R2.E3. Does not ship Magpie as a Grok worker until the
supervisor proxy suite is green.

## Outcome

A parent agent (Grok Bot, Hermes, OpenClaw, Grok Build) can start Magpie with a coarse
plan, receive a **Pi session id**, go away, and later status / instruct the same work.
Magpie remains the autonomous browser worker (D55, D58). No Magpie daemon. No MCP
requirement. No second session namespace.

## Risks

- Teaching ACP's in-memory `sessionId` (`loadSession: false`) as if it were Pi's.
- Inventing `mp_*` ids while Pi already resumes jsonl.
- Letting the parent plan skip scout/coach (D58 failure mode).
- Burning Grok Bot credits on the harvest the skill was supposed to delegate.
- Calling a real Bot install the first test — wasted expensive run. The OpenRouter
  supervisor proxy is the cheap gate.
- Assuming Cursor Grok Bot entitlement equals Pi `/login xai` (RESEARCH-04/05).
- Putting this work ahead of R1.E2 as if it improved harvest quality. It does not.

## Stories

- [PARENT-01: Pi session handle, plan admission, proxy tests, skills](../stories/parent-01-session-handle.md)
- PARENT-02 (task only): live Grok Bot notes after the proxy is green

## Tasks

| Task | Spec IDs | Deps | Status |
| --- | --- | --- | --- |
| [PARENT-00-T01](../tasks/parent-00-t01-feasibility-research.md) | RESEARCH-01..09 | none | partial — RESEARCH-09 only |
| [PARENT-01-T01](../tasks/parent-01-t01-session-cli.md) | PARENT-01..04, RESEARCH-09 | 00-T01 canary | done |
| [PARENT-01-T02](../tasks/parent-01-t02-plan-admission.md) | PARENT-05..07 | none (parallel with T01) | done |
| [PARENT-01-T03](../tasks/parent-01-t03-supervisor-proxy.md) | PARENT-13..16, PARENT-07 | T01, T02, skill draft | todo — **R6.E2 gate** |
| [PARENT-01-T04](../tasks/parent-01-t04-host-skills.md) | PARENT-08..11 | T03 (copy iterates on proxy failures) | todo |
| [PARENT-01-T05](../tasks/parent-01-t05-cost-profiles.md) | PARENT-11, PARENT-12 | T01 | todo — parallel |
| [PARENT-02-T01](../tasks/parent-02-t01-grok-bot-live.md) | RESEARCH-01..08 | T03 green | todo — not the gate |

## Definition of done

- Client-facing id is Pi's; `--session` restores the same Magpie goal.
- Parent plan is admitted; harvest class gets scout/coach without Magpie `/plan` TUI.
- `npm run test:parent-supervisor` passes locally with `OPENROUTER_API_KEY` under the
  cost cap. That is the success proxy.
- `npm test` still has no provider key (D37).
- Grok/Hermes/OpenClaw skills teach the same CLI. MCP not required.
- Real Grok Bot install is documented as research (PARENT-02-T01), not claimed from
  the proxy suite.

## Cross-epic

- D58 / AGENT-16: admission reuses classification; does not reimplement `/coach`.
- D12 / `pi-models.ts`: profiles bind existing slots.
- Jobs V2: optional later tick target; this epic does not wait on R2.E3.
