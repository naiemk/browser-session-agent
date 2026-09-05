# Typed workers: scratch, plan/write/review/code, not a smarter clicker

**Status:** discussing
**Captured:** 2026-09-05
**Do not promote until:** the maturity bar at the bottom is met.

The parent is a browser operator. Campaign-shaped work also needs **disk**, a **coder**, and a **frontier writer**, without putting Opus on every `act` and without sharing the Chromium login. Those jobs are separate Pi identities (depth 1) whose cwd is `goals/<id>/scratch/`.

Site skills ([site-skills.md](./site-skills.md)) are **their** UI: a published capability map the operator pastes. Scratch and workers are **ours**: files and coding tools the parent does not have.

## The problem

GLM (the operate model) is weak at the **brief** and fine at the **page**. A session that must tailor a CV per job, keep a tracker, or unzip a download tries to become a coding agent in the browser: paste sites, EtherCalc, committing `Import` because `SearchSearch` did not match.

Putting a frontier model on every click is the wrong fix. Quality follows **kind + model**, not “make the clicker Opus.”

“Isn’t that just running Pi in a repo?” Yes **iff** the operator chose that cwd. Default hosted/chat must not use `process.cwd()` (this repo, a helper install, or the VPS). A repo mount is an explicit grant. The default workspace is goal scratch.

## Current shape

The parent stays unchanged: `composeAgent` + `noTools: "builtin"` + browser identity. Workers are a **Pi JSON subprocess** (`pi --mode json -p --no-session`), not a second chat and not a second cost router (D12). Human yield stays on the parent. Child return is a short digest plus paths, not the transcript (D29). Depth 1: workers do not spawn workers.

This is **not** the living task graph in `src/core/plan.ts` (D26/D28). A `scratch/plan.md` is a planner **artifact**. Suite / `browser-agent run` stay single-agent.

### Scratch vs the ledger

| Tree | What it is | Deletable |
| --- | --- | --- |
| `events.jsonl`, `artifacts/` | Audit trail | No (except payloads, already called out) |
| `goals/<id>/scratch/` | Working files the workers share | Yes |

Never mount `profile/` or the cookie jar into a worker. Helping the browser without sharing login means sharing **scratch files**, not the session.

### Kinds

| Kind | Tools | Model floor | Browser |
| --- | --- | --- | --- |
| **plan** | read scratch, no `act` | `@ultra` + high thinking | no |
| **operate** | existing harness | GLM / medium (parent today) | helper |
| **write** | read/write only | `@ultra` | no |
| **review** | read files | `@ultra` | no |
| **code** | read/write/bash in jail | `@medium` | no |

Use: upload CV → code extracts md → operate saves JDs → **write** tailors CV per job → **review** before apply → operate uploads.

### Network identity

Public `curl` is fine. Sessionful download is parent/harness `save_to_scratch(url)` (later), or the operator. Chromium identity is not a worker credential.

### Token gates

- Route **plan** with a zero-token heuristic later, or `/plan` now. Skip plan for “submit this tab.”
- Planner session: empty of observe dumps; cap peeks/turns; `plan.md` ≤ ~800 words; parent gets a ≤500 token digest.
- **Review** only before a committing apply/send, after free checks (files exist). Skip if unchanged and already passed.
- Do not replan every job.

## Architecture (Phase 1)

Spawn a **fresh** Pi argv. Do not re-exec `process.argv[1]` (hosted that is the web server; local TUI that inherits `--no-builtin-tools` and `-e src/extension.ts`). Child:

- `cwd = goals/<id>/scratch`
- `--no-extensions` (plus an explicit `-e` for `pi-model-auto` so `@ultra` still routes)
- coding builtins allowed, `--tools` from the agent file
- packaged `agents/*.md` only — not `~/.pi/agent/agents` and not the user’s repo

Parent registers a `subagent` tool (single agent only) and `/plan`. Coding builtins stay off on the parent.

## Later, not this slice

One Docker per campaign; sqlite; collect servers; hosted Playwright / MS Playwright sku; auto-plan heuristic; `save_via_browser`; parallel/chain; restoring parent `bash`.

Chromium stays on the desk (D11). A campaign jail is not Chrome on the VPS.

## Decisions this touches

- **D11** — workers are not a reason to run Chromium on the VPS.
- **D12** — model floors are Pi Router ids (`@ultra`, `@medium`), not a second router.
- **D26 / D28** — `plan.md` is not the gated planner graph.
- **D29** — parent does not ingest the child transcript.
- **D31 / D33** — campaigns and quality; this is the file/coder seam those need.

## Maturity bar

Do not promote until:

- A multi-entity chat is cheaper and clearer **with** `/plan` than without (same jobs, measured turns and retries).
- Isolation tests: child cwd is scratch, child argv has no browser extension and no `--no-builtin-tools`, parent `getActiveTools()` still has no `bash`.
- D28 is not quietly undone (no task graph in this idea).
- Failure mode named: a worker that can `bash` must not see `profile/` or cookies, even by accident of `cwd`.

## Discussion notes

### 2026-09-05 — capture

Execution resources (disk, coding tools, later sqlite and a jail) without making the clicker a coding agent. Parent unchanged; child is Pi’s subagent mechanism with our wrap for cwd and extension isolation.

### 2026-09-05 — Phase 1 scope

Idea plus additive code: scratch dir, four packaged agents, `subagent` + `/plan`, no parallel/chain, no suite change.

### 2026-09-06 — @ultra is a prompt floor

`--model @ultra` is not a Pi model id (Pi: "Model not found. Use --list-models"). Workers select `pi-router/auto` and prefix the first turn `@ultra` so pi-model-auto routes. The parent TUI also loads that extension and remaps a floor `--model` the same way. Concrete `provider/id` still passes through. Without the router extension, omit `--model` rather than crash.

`require.resolve("pi-model-auto/package.json")` throws because the package `exports` map omits `package.json`. Resolve the main entry (`src/index.ts`) instead.
