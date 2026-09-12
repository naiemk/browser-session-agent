# Evaluation: PARENT-01-T01 session CLI

Date: 2026-09-12
Implementer: Auto (Composer)
Spec IDs: PARENT-01..04, RESEARCH-09
Evidence: L0/L1 unit + L6 CLI (`tests/unit/parent-session.test.ts`). Provider-free.
Do not claim R6 shipped, R6.E2, or live Grok Bot.

## Discovery

- Local CLI only spawned Pi; no Magpie-owned compact yield that exits without Chrome.
- Pi `SessionManager` delays jsonl flush until an assistant message — parent start must
  persist header + `magpie-goal` explicitly.
- Default Pi session paths are cwd-hashed; parents need Magpie `coreRoot()/pi-sessions`.
- Interactive TUI must stay a passthrough (do not force `--session-dir` on bare `magpie`).

## Changes

- `src/host/parent-session.ts` — session dir, start/resume, `magpie-goal`, JSON handle
- `src/hosts/local-cli/cli.ts` — `--json` path (no Chrome); validate `--session` before Pi
- `src/hosts/local-cli/launch.ts` — help for `--json` / Bot `--session-dir` override
- `docs/grok-bot-feasibility.md` — thin PARENT-00; RESEARCH-01..08 unverified; RESEARCH-09 dated

## Initial evidence

```bash
npx tsx --test tests/unit/parent-session.test.ts
```

8 pass / 0 fail (includes CLI `--json` + `--plan-file` smoke).

Highest evidence level claimed: **L6** (CLI) / **L0** (module).

## Spec validation

| Requirement | Status |
| --- | --- |
| Default session-dir under Magpie core root | Pass |
| `--json` prints `{ session_id, goal_id, state, … }` and exits | Pass |
| Second `--json --session` restores same `goal_*` | Pass |
| Unknown `--session` exits nonzero | Pass |
| Start returns without Chromium / provider | Pass |
| Bare TUI not hijacked | Pass (no session-dir unless parent flags) |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 3 | 4 | Explicit jsonl persist; resume validates before Pi forward |
| Boundaries | 4 | 4 | `--json` exits; TUI still Pi; no MCP/daemon |
| Concurrency / crash | 3 | 3 | FS session files only |
| Safety / privacy | 3 | 3 | No provider keys in path |
| Observability | 3 | 4 | Compact JSON + next_check_hint |
| Perf/cost | 4 | 4 | No Chrome/model on start |
| Test realism | 3 | 4 | Real CLI bin + SessionManager round-trip |
| Maintainability | 3 | 4 | Flags isolated in `parent-session.ts` |

## Improvement pass

- Help documents Grok Bot `--session-dir /workspace/magpie/sessions`.
- CLI test covers `--plan-file` → scratch `plan.md` without Chrome (T01↔T02 seam).

## Requirement coverage

PARENT-01..04 → `parent-session.ts`, `cli.ts`, `launch.ts`, `parent-session.test.ts`.
RESEARCH-09 → `docs/grok-bot-feasibility.md`.

## Open risks / follow-ups

- Follow-up `magpie --session <id> -p` still needs a provider (Pi); not claimed here.
- R6.E2 / PARENT-01-T03 OpenRouter supervisor proxy still open.
- R6.0 RESEARCH-01..08 remain unverified.
