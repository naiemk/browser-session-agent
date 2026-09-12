# Grok Bot / parent-agent feasibility

Status: **research dump for PARENT-00-T01.** Most platform facts are unverified.
The only executable canary here is RESEARCH-09 (local, provider-free).

Authority: [`docs/parent-agent.md`](parent-agent.md). Do not treat this as R6 shipped.

## RESEARCH-01 … RESEARCH-08

| ID | Question | Status | Notes |
| --- | --- | --- | --- |
| RESEARCH-01 | Grok Bot stdio MCP via `npx`? | **unverified** | CLI path does not wait. |
| RESEARCH-02 | Skill install from URL/repo vs marketplace? | **unverified** | PARENT-01-T04 later. |
| RESEARCH-03 | Bot computer persistence (`/workspace` vs `~`)? | **unverified** | Default Magpie `--session-dir` is `coreRoot()/pi-sessions`; Bot override `/workspace/magpie/sessions` is documented in the skill ticket. |
| RESEARCH-04 | Pi `/login xai` vs Magpie `createLiveModel` | **unverified** | Not required for session handle. |
| RESEARCH-05 | Cursor Grok Bot entitlement vs SuperGrok OAuth | **unverified** | Do not promise no-API-key. |
| RESEARCH-06 | Terms for subscription OAuth from third-party agent | **unverified** | |
| RESEARCH-07 | Magpie Chromium on Bot `DISPLAY`? | **unverified** | |
| RESEARCH-08 | Grok Bot routines polling `magpie --session … -p status`? | **unverified** | Assumed push notify unavailable. |

## RESEARCH-09 — Magpie `-p` / session canary (2026-09-12)

**Result: pass (provider-free Magpie packaging path).**

Canary exercised without a live provider or Chrome:

1. `SessionManager.create(cwd, sessionDir)` under a temp Magpie `pi-sessions` dir.
2. Append `magpie-goal` custom entry with a `goal_*` id; force-write the jsonl
   (Pi delays flush until an assistant message; Magpie parent start persists explicitly).
3. `SessionManager.open` / `resumeParentSession` restores the same `session_id` and
   `goal_*` via `restoreGoalId`.
4. CLI `magpie --json --session-dir … <objective>` prints
   `{ session_id, goal_id, state }` and exits 0 without launching Chromium.
5. CLI `magpie --json --session <id>` returns the same `goal_id`.
6. Unknown `--session` exits nonzero.

**Implication for T01:** Magpie can own the compact-yield `--json` path without waiting
on a live Pi `-p` provider turn. Follow-up `magpie --session <id> -p "…"` still forwards
to Pi with `--session-dir` injected; that path remains the operator/provider surface.

Node: process.versions.node at canary time. Pi: `@earendil-works/pi-coding-agent` from
repo lockfile (0.85-class SessionManager APIs).

## Out of scope here

Installer, MCP, Grok Bot skill, OpenRouter supervisor proxy (PARENT-01-T03 / R6.E2).
