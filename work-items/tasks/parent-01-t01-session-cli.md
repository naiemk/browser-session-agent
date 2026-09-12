---
id: PARENT-01-T01
title: Stable Pi session-dir, print id, restore goal, compact yield
story: PARENT-01
epic: parent-agent
status: todo
---

# PARENT-01-T01 — Session CLI packaging

Spec: **PARENT-01**, **PARENT-02**, **PARENT-03**, **PARENT-04**
Authority: [`docs/parent-agent.md`](../../docs/parent-agent.md)
Depends: PARENT-00-T01 RESEARCH-09 canary (choose `-p` vs RPC)

## Goal

Parents use Pi's session id. Magpie chooses a stable `--session-dir`, prints the
handle, yields after start, and restores the same `goal_*` on `--session`.

Do not add `mp_*` ids. Do not add MCP. Do not add a daemon.

## Do

1. Default `--session-dir` to Magpie home (`~/.browser-agent-core/pi-sessions` or
   documented equivalent). Document Grok Bot override `/workspace/magpie/sessions`.
2. On parent start (`-p` / `--json` / documented flag), print machine-readable
   `{ session_id, goal_id, state, next_check_hint? }`. Human text may precede it;
   parsers need one reliable JSON object (last line or `--json` only).
3. `--session <id>` with a missing file is a hard error.
4. Compact yield: first parent prompt MUST NOT run the harvest to completion in-process.
   Record the intended stop (one planning/admit turn, or a bounded tick). Exact yield
   heuristic is an implementation choice; the test is "process exits, jsonl + goal dir
   remain, second `-p` continues."
5. Keep forwarding remaining args to Pi. Do not break interactive `magpie` TUI.

## Tests (provider-free)

`tests/unit/` and/or `tests/integration/` (names up to implementer):

- default session-dir is under Magpie core root, not `process.cwd()` hash;
- printed JSON includes a session id Pi would accept;
- FakePi / temp jsonl: second launch with `--session` restores the same `goal_*`;
- unknown `--session` exits non-zero;
- start returns without requiring a live browser (mock model or no-op yield).

No `OPENROUTER_API_KEY`. Not the supervisor proxy (that is T03).

## Done when

A parent can start, kill the process, and continue with `--session <id>` on the same
goal. Interactive Magpie still works.
