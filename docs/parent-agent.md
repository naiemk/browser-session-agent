# Parent-agent sessions (Grok Bot, Hermes, OpenClaw)

Status: **accepted product direction (D59). Spec is loose.** Implementation is the
PARENT epic. Do not treat this as Jobs V2 cutover, R1 coach live, or an MCP product.

Grok Bot, Hermes, OpenClaw, and Grok Build are **managers**. Magpie stays the
autonomous browser worker. The handle they keep is a **Pi session id**. Magpie does
not invent a second session namespace. MCP is optional later; it is not the contract.

Related: D1, D7, D12, D37, D38, D55, D58. Tickets: `work-items/epics/parent-agent.md`.
Roadmap: Track B / R6 in [`docs/release-roadmap.md`](release-roadmap.md).

---

## 1. Idea

A parent agent should be able to say:

> Delegate this long browser harvest to Magpie. Here is the objective and a coarse plan.
> Give me an id. I will come back later.

Magpie:

1. stores work in a Pi session (`--session-dir` under Magpie home, not cwd-hashed
   `~/.pi/agent/sessions` unless that is also Magpie home);
2. prints the Pi session id;
3. admits the parent's plan and, when the loop is unknown, inserts scout → coach →
   harvest (D58) — Magpie `/plan` TUI is not required on this path;
4. yields a compact status and exits (`-p` / RPC). The process may die. The id still
   works;
5. on `magpie --session <id> -p "…"`, restores the same Magpie `goal_*` (already bound
   via `magpie-goal` entries) and continues from disk (D7).

Parents supervise. They do not call `click` / `type`. They do not browse the same
harvest themselves (that burns their credits).

```text
Parent (Grok Bot / Hermes / OpenClaw)
  → magpie --session-dir … --name "…" -p @plan.md "<objective>"
  → session_id
  → magpie --session <id> -p "status" | "Ignore agencies"
```

---

## 2. What already exists

Do not rebuild these:

| Piece | Where |
| --- | --- |
| Pi `--session`, `-c`, `--session-dir`, `--name`, `-p`, `--mode rpc` | Pi 0.85 |
| Magpie is a Pi extension; CLI forwards Pi args | `src/hosts/local-cli/launch.ts` |
| One Magpie `goal_*` per Pi conversation; restore on resume | `src/host/pi-session-goal.ts` |
| Goal / evidence / plan graph on disk, not in the jsonl | D7, `src/core/paths.ts` |
| Other agents spawn a harness, never see refs | D55, `skills/browser-harness/SKILL.md` |
| Scout → coach → harvest when the loop is unknown | D58, `docs/coach.md` |
| Model pins `default` / `plan` / `coach` | `src/host/pi-models.ts` |

What is missing is **packaging + parent skill + proof that a supervising LLM will use
the CLI as intended**.

ACP `session/new` in `src/hosts/acp/server.ts` is **not** this handle: `loadSession:
false`, in-memory, `session/prompt` runs until the browser closes. Keep ACP for
short one-shot harnesses or later wrap the Pi session; do not teach parents that id.

---

## 3. Requirements (PARENT-*)

RFC 2119. Cite these IDs in tickets. Do not invent sibling IDs.

### Handle (PARENT-01 … PARENT-04)

**PARENT-01.** The client-facing handle SHALL be Pi's session id (path or UUID / prefix
that `pi --session` already accepts). Magpie MUST NOT mint a parallel `mp_*` /
`session_*` product id. `goal_*` MAY be printed as Magpie-internal metadata.
- Rationale: Pi already resumes jsonl; Magpie already binds goal to it
- Owner: CLI wrapper around existing Pi launch
- Evidence: L0 + L6
- Ticket: PARENT-01-T01

**PARENT-02.** Magpie parent invocations SHALL use a stable `--session-dir` under Magpie
home (default `~/.browser-agent-core/pi-sessions`, overridable). On Grok Bot the
installer / skill SHALL point this at `/workspace/magpie/sessions` so a cwd change does
not look like a new product.
- Ticket: PARENT-01-T01
- Research: RESEARCH-03 (what persists on the Bot computer)

**PARENT-03.** `start` (first `-p` / RPC prompt on a new session) SHALL return promptly
with `{ session_id, goal_id, state, next_check_hint? }` as machine-readable stdout
(JSON on `--json` or a documented last-line JSON). It MUST NOT hold the process for
the entire harvest. Follow-ups use `--session <id> -p`.
- Rationale: parent tool timeouts; no Magpie daemon (D4/D56 ticks, not a supervisor)
- Ticket: PARENT-01-T01

**PARENT-04.** `--session <id>` of a Magpie session SHALL restore the same `goal_*` and
MUST NOT mint a new goal. Missing session is a hard error, not a silent new chat.
- Evidence: L0 using `bindSessionGoal` + a real jsonl round-trip if cheap
- Ticket: PARENT-01-T01

### Plan admission (PARENT-05 … PARENT-07)

**PARENT-05.** A parent MAY supply a coarse plan (`@plan.md` or `--plan-file`). Magpie
SHALL treat it as Layer 1 (objective, constraints, stop rules, worker-kind hints).
It MUST NOT execute click/type/CSS procedures from that file. Magpie `/plan` TUI is
not required on this path.
- Owner: plan admission module
- Ticket: PARENT-01-T02

**PARENT-06.** On start, Magpie SHALL classify the objective (D58:
`calibration_required` / `known_flow` / `criteria_unsettled`). For
`calibration_required` it SHALL insert scout → coach → harvest into the admitted plan
even if the parent omitted them. For `known_flow` it MUST NOT cargo-cult a coach step.
- Ticket: PARENT-01-T02

**PARENT-07.** After start, the parent MUST NOT replan the harvest on every status
check. New user constraints go in as `--session <id> -p "<instruction>"` (steer /
follow-up). Magpie loops the admitted plan.
- Ticket: PARENT-01-T03 (supervisor tests), PARENT-01-T04 (skill copy)

### Supervision (PARENT-08 … PARENT-10)

**PARENT-08.** The same CLI contract SHALL be what Grok Bot, Hermes, and OpenClaw are
taught. Host skills MAY differ in invocation chrome (`/` vs spawn); they MUST NOT
fork Magpie into per-host products.
- Ticket: PARENT-01-T04

**PARENT-09.** MCP is not required for MVP. If added later, it SHALL wrap the same
session id and operations. Laptop `localhost` MCP is not a Grok Bot design.
- Ticket: none until RESEARCH-01 says Grok Bot stdio MCP is clearly better than CLI

**PARENT-10.** Magpie MUST NOT expose `click` / `type` / refs on the parent surface
(D55). Park / `waiting_human` MAY appear in status.

### Cost (PARENT-11 … PARENT-12)

**PARENT-11.** Harvest turns SHALL run on Magpie's Pi provider (pins / profile), not
on the parent's conversation model. The parent skill SHALL tell the manager not to
duplicate the browser work.
- Ticket: PARENT-01-T04, PARENT-01-T05

**PARENT-12.** Named cost profiles MAY bind `default` / `plan` / `coach` (and coder
subagent) to `provider/id`. Magpie MAY recommend a profile from authenticated
providers. It MUST NOT silently switch to a paid API-key backend the user did not
confirm. Keys MUST NOT appear in skills, MCP, or reports.
- Ticket: PARENT-01-T05
- Extends D12: profiles are operator policy, not a second cheapest-at-floor router

### Testing (PARENT-13 … PARENT-16)

**PARENT-13.** Default `npm test` MUST remain provider-free (D37). Parent supervisor
proxy tests are an **opt-in** live script using the operator's `OPENROUTER_API_KEY`.
CI MUST NOT require that key.

**PARENT-14.** Before any real Grok Bot / Hermes install is called success, the
**supervisor proxy suite** MUST pass locally. That suite is the cheap success proxy
for "a parent LLM will use Magpie the way we expect." It is Track B's R6.E2 gate.

**PARENT-15.** The proxy suite SHALL use a fake Magpie CLI (records argv, returns a
stable session id, does not launch Chrome or Magpie harvest). The live model is only
the **supervisor**. Cap cost (see §5). Cheap OpenRouter flash/haiku class.

**PARENT-16.** Plan admission for `calibration_required` vs `known_flow` SHALL have
provider-free L0 tests. The live supervisor tests additionally assert the parent
wrote a coarse plan (goal + constraints, no click/type) when it did delegate.

---

## 4. Research (must not be assumed)

Tickets MUST resolve or mark **unverified**. Do not hard-code platform folklore.

| ID | Question | Blocks |
| --- | --- | --- |
| **RESEARCH-01** | Can Grok Bot register a **stdio** MCP server via `npx` on the Bot VM? Official docs vs third-party. | MCP adapter only. CLI path does not wait. |
| **RESEARCH-02** | Can a Grok Bot skill be installed from a URL/repo, or only marketplace / save-from-chat / Teach a task? | PARENT-01-T04 distribution copy |
| **RESEARCH-03** | What on the Bot computer persists (`/workspace` vs npm global vs `~/.pi`)? Node version? Playwright/Chrome? | Installer; `--session-dir` location |
| **RESEARCH-04** | Pi 0.85.1 `/login xai` subscription vs Magpie `createLiveModel` (today: no xAI in `KEY_ENV_NAMES`; durable host gated on env keys). Device-code on a headless VM? | Magpie-as-Grok-worker backend, not the CLI handle |
| **RESEARCH-05** | Cursor Grok Bot entitlement vs SuperGrok OAuth for `api.x.ai`. Likely not the same. | Auth UX; do not promise "no API key" to every Bot user |
| **RESEARCH-06** | Terms: subscription OAuth from a third-party agent | Shipping Magpie→Grok model, not proxy tests |
| **RESEARCH-07** | Does Magpie Chromium appear on Agent Computer `DISPLAY` for takeover? | Login UX on Bot VM |
| **RESEARCH-08** | Can Grok Bot routines poll `magpie --session id -p status`? Push notify is assumed unavailable. | Long-job UX |
| **RESEARCH-09** | Pi `-p` / RPC vs Magpie extension: does `-p` load Magpie, restore `magpie-goal`, and allow a compact yield without a TUI? **Experiment locally before polishing the installer.** | PARENT-01-T01 |

Write findings in [`docs/grok-bot-feasibility.md`](grok-bot-feasibility.md) (created by
PARENT-00-T01). Mark verified vs unverified.

---

## 5. Supervisor proxy suite (success proxy)

This is the test the operator runs with an OpenRouter key **before** spending Grok Bot
or live-harvest credits. It does **not** prove Magpie can harvest Instagram. It proves
the **manager behavior** and the **plan handoff** so a later expensive run is not wasted
on a parent that starts two sessions or skips the plan.

### Command

```bash
OPENROUTER_API_KEY=… npm run test:parent-supervisor
```

Skip (non-fail) when the key is absent. Not part of `npm test`.

### Harness

1. Isolated temp `HOME` / Magpie root / `--session-dir`.
2. Fake `magpie` on `PATH`: records argv + stdin; prints a JSON handle; never starts
   Chrome or Pi.
3. Supervisor: one cheap OpenRouter model (default
   `openrouter/google/gemini-2.5-flash`), Magpie parent skill as instructions, tools
   limited to `run_command` and `write_file` (or equivalent). **No browser tools.**
4. Hard caps: fail the suite if estimated cost exceeds **USD 0.25** or total supervisor
   turns exceed **16** across all cases. Prefer one turn per case.
5. Write traces under `results/parent-supervisor/<date>/` (argv, plan.md, tokens). No
   secrets.

### Cases (minimum)

| Case | User prompt | Pass |
| --- | --- | --- |
| `tiny_lookup` | One fact from a single URL / "what is the title of X" | Does **not** invoke `magpie` start |
| `harvest_delegate` | Multi-site qualify ~50 entities, keep working | Exactly one start; writes `plan.md`; argv has `--session-dir` or `--session`; stdout parsed for `session_id` |
| `plan_quality` | Same as harvest (inspect the written plan) | Plan has Goal + constraints or stop rules; **no** `click(`, CSS selectors, or "type into" procedures |
| `status_followup` | "How's it going?" after harvest | `--session` **same id**; no second start |
| `instruct_followup` | "Ignore agencies / only founders" | `--session` same id; instruction text in the `-p` prompt or stdin |
| `no_duplicate` | "Also go find those prospects" while one id is live | Does not start a second Magpie session |

Fixture user prompts live in `tests/fixtures/parent-supervisor/` so they can be
diffed. Do not use live Instagram/LinkedIn.

### What this does not prove

- Magpie scout/coach quality on a real site (R1.E2 / R3.E3).
- Grok Bot plugin UI, Auto Review, or Bot VM Node version (PARENT-02-T01 + RESEARCH-*).
- Pi xAI subscription auth (RESEARCH-04).

Those stay separate. A green proxy suite **unblocks teaching the skill**; it does not
tick R1.E2.

---

## 6. Implementation order

```text
PARENT-00-T01  research dump (feasibility doc + RESEARCH-09 local Pi -p canary)
       ↓
PARENT-01-T01  session-dir, print id, restore goal, compact yield   [L0, no provider]
PARENT-01-T02  plan admission (inject scout/coach)                    [L0, no provider]
       ↓
PARENT-01-T03  supervisor proxy suite (OpenRouter, fake CLI)          [opt-in live]
PARENT-01-T04  host skills (Grok / Hermes / OpenClaw)                 [after proxy green]
PARENT-01-T05  named cost profiles + recommend                        [parallel after T01]
       ↓
PARENT-02-T01  real Grok Bot install notes (research; not the gate)
```

Do not start a Grok-specific npm installer or MCP server before T01–T03.

---

## 7. Out of scope for this epic

- Magpie daemon / systemd.
- Replacing Jobs V2 or deleting `src/jobs`.
- Turning Magpie into chrome-devtools-mcp.
- Default-on challenge/approval flags.
- QUAL/PERF behavioral tickets.
- Promising SuperGrok-without-key to Cursor-only Grok Bot users (RESEARCH-05).
