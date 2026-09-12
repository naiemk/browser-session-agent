---
id: PARENT-00-T01
title: Parent-agent feasibility research and Pi -p canary
story: PARENT-01
epic: parent-agent
status: partial
---

# PARENT-00-T01 — Feasibility research and Pi `-p` canary

Spec: **RESEARCH-01..09**
Authority: [`docs/parent-agent.md`](../../docs/parent-agent.md)

## Goal

Write down what is verified vs assumed **before** packaging. The only executable canary
in this ticket is RESEARCH-09: Magpie as a Pi extension under `-p` / `--session` /
`--session-dir` without a TUI.

Do not implement the installer, MCP, or Grok Bot skill here.

## Do

1. Create [`docs/grok-bot-feasibility.md`](../../docs/grok-bot-feasibility.md) with
   citations (docs.x.ai Grok Bot vs Grok Build vs grok.com connectors; Pi session
   docs). Table: verified / inferred / unverified for RESEARCH-01..08.
2. **RESEARCH-09 canary (local, no Grok Bot):**
   - temp `HOME` + `--session-dir`;
   - `magpie --session-dir … --name parent-canary -p "reply with the word pong only"`
     (or equivalent) using a mock model if a live key is not wanted;
   - confirm a jsonl appears, `/session`-equivalent id is knowable;
   - second process `magpie --session <id> -p "…"` restores `magpie-goal` (same
     `goal_*`).
   If `-p` does not load the extension or drops custom entries, **stop and record
   the gap** — T01's yield JSON may need `--mode rpc` instead of pretending `-p`
   works.
3. Record Node/Pi versions used. Do not require OpenRouter for this ticket; mock or
   skip the model call if Magpie `-p` cannot run without a provider — then the canary
   is "session file created + goal entry round-trip" via FakePi or a tiny jsonl
   fixture.

## Tests

No new CI live tests. A unit or integration test that round-trips `magpie-goal` on a
temp session dir is allowed if it stays provider-free (D37).

## Done when

`docs/grok-bot-feasibility.md` exists with RESEARCH-01..08 marked, and RESEARCH-09
has a dated canary result (pass, or a concrete blocker for T01).
