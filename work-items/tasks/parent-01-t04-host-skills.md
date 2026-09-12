---
id: PARENT-01-T04
title: Host skills for Grok Bot, Hermes, and OpenClaw
story: PARENT-01
epic: parent-agent
status: done
---

# PARENT-01-T04 — Host skills

Spec: **PARENT-08**, **PARENT-09**, **PARENT-10**, **PARENT-11**, **PARENT-07**
Authority: [`docs/parent-agent.md`](../../docs/parent-agent.md)
Depends: PARENT-01-T03 (iterate copy from proxy failures)

## Goal

One CLI contract, three thin skill files. Magpie is a delegated worker. Parents keep
the Pi session id. They do not drive the browser and do not duplicate the harvest.

## Do

1. Canonical skill body (when to delegate, when not, start → id → status/instruct,
   plan.md shape, no click/type, no second session, next_check_hint).
2. Package as:
   - Magpie/Pi skill (repo `skills/` — parent managers that spawn Magpie);
   - Grok Bot instructions (same text; RESEARCH-02 says how the user installs it);
   - Hermes / OpenClaw pointers (ACP or CLI; do not teach in-memory ACP session ids
     as the durable handle unless ACP is wrapped around Pi `--session`).
3. Update `skills/browser-harness/SKILL.md` so it does not contradict the durable
   Pi-session path (one-shot ACP vs long job). Two modes may exist; name them.
4. No setup scripts that copy API keys. Point at `magpie --check` / profiles (T05).

## Research

RESEARCH-02: do not claim "paste this GitHub URL into Grok Bot" until the
feasibility doc says that works. If only save-from-chat works, the skill is the
text to paste.

## Tests

String checks: skill contains session-id revive, forbids click/type, forbids
duplicate start, tells the parent not to harvest in parallel. Proxy suite (T03)
is the behavioral test.

## Done when

Skills exist, T03 still passes against this copy, harness skill does not send
long jobs into the one-shot ACP path by default.
