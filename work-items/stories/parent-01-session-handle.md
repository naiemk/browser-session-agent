# PARENT-01: Pi session handle for parent agents

Status: todo

As a supervising agent (Grok Bot, Hermes, OpenClaw), I get a Pi session id when I
delegate browser work to Magpie, I can revive that id after my process exits, I hand
Magpie a coarse plan rather than driving `/plan` in Magpie's TUI, and Magpie still
inserts scout/coach when the harvest loop is unknown.

## Acceptance criteria

- First Magpie parent start prints a Pi session id (JSON when `--json`).
- `--session <id>` restores the same `goal_*`; it does not mint a new goal.
- Stable `--session-dir` under Magpie home (not cwd-hashed unless that *is* Magpie home).
- Start yields; it does not hold the process for the whole harvest.
- Parent `@plan.md` is Layer 1. Magpie admission injects scout → coach → harvest for
  `calibration_required` and does not cargo-cult coach for `known_flow`.
- Opt-in OpenRouter supervisor proxy: tiny lookup is not delegated; harvest is delegated
  once with a coarse plan; status/instruct reuse the same id. Cost-capped. Not in
  `npm test`.
- One CLI contract in Grok/Hermes/OpenClaw skills.

## Spec

[`docs/parent-agent.md`](../../docs/parent-agent.md) · D59

## Tasks

- [PARENT-00-T01](../tasks/parent-00-t01-feasibility-research.md)
- [PARENT-01-T01](../tasks/parent-01-t01-session-cli.md)
- [PARENT-01-T02](../tasks/parent-01-t02-plan-admission.md)
- [PARENT-01-T03](../tasks/parent-01-t03-supervisor-proxy.md)
- [PARENT-01-T04](../tasks/parent-01-t04-host-skills.md)
- [PARENT-01-T05](../tasks/parent-01-t05-cost-profiles.md)

## Done when

T01–T03 are green (T03 = local OpenRouter proxy). Skills exist. Cost profiles may lag
T03 but not the proxy cases that only need a fake CLI.
