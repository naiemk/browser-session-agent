---
id: PARENT-02-T01
title: Real Grok Bot install notes (not the success gate)
story: PARENT-01
epic: parent-agent
status: todo
---

# PARENT-02-T01 — Grok Bot live notes

Spec: **RESEARCH-01..08**
Authority: [`docs/parent-agent.md`](../../docs/parent-agent.md)
Depends: PARENT-01-T03 green (do not burn Bot credits to discover skill copy bugs)

## Goal

After the OpenRouter proxy is green, try the same flow on a real Grok Bot computer
and record what actually happened. This ticket produces notes, not a product claim.

## Do

On a Bot (fresh if possible):

1. Node version, `npx`, whether portable Node 24 is needed.
2. Where files persist (`/workspace` vs home vs npm cache).
3. `magpie --session-dir /workspace/magpie/sessions` start → id → disconnect app →
   status with `--session`.
4. Whether a skill can be saved from pasted T04 text; URL install if RESEARCH-02.
5. Optional: ask the Bot to add a stdio MCP `npx` server (RESEARCH-01). CLI success
   is enough to not block.
6. Headed Chromium vs Agent Computer takeover (RESEARCH-07).
7. Auth: Pi `/login xai` vs existing OpenRouter key (RESEARCH-04/05). Do not collect
   tokens in the notes.

Append a row to [`docs/live-run-evidence-log.md`](../../docs/live-run-evidence-log.md)
and update [`docs/grok-bot-feasibility.md`](../../docs/grok-bot-feasibility.md).

## Pass / fail

This ticket **cannot** tick R6.E2. It may tick R6.E3 (optional live) when:

- the Bot reused the same session id after reconnect;
- it did not duplicate a harvest Magpie was already running;
- failures are installer/UX bugs, not "we never tested the skill."

## Done when

Dated notes exist. Unverified RESEARCH rows are updated.
