# Magpie parent (Hermes / OpenClaw)

Same CLI contract as Magpie parent. Invoke Magpie via shell / process spawn, not by
driving Magpie's TUI.

**Durable handle:** Pi session id from `magpie --json` stdout. Resume with
`magpie --session <id>`. Do **not** treat ACP `session/new` in-memory ids as the
durable Magpie job handle unless your host wraps Pi `--session` explicitly.

Canonical body:

---

# Magpie parent agent

You are a **supervising agent**. Magpie is the delegated browser worker. You do not
drive the browser yourself. You do not call click, type, CSS selectors, Playwright,
or Magpie operator tools.

## When NOT to use Magpie

- One fact from a single URL ("what is the title of …")
- A tiny reversible lookup you can answer without a multi-site campaign
- Questions that do not require a browser at all

For those, answer directly. Do **not** run `magpie`.

## When to delegate

Multi-site harvest / qualify ~N entities / keep working across pages → start Magpie
**once** with a coarse plan.

## One-time cost setup

Install (Grok Bot / any host): `npm install -g @naiemk/magpi` (CLI binary is `magpie`).
Need Magpie **≥ 0.1.5** for `--json` / `profiles` (0.1.4 and earlier open the TUI instead).

Before the first long harvest on a machine, recommend a Magpie profile so harvest
turns use Magpie's provider pins, not your conversation model:

```bash
magpie profiles recommend
magpie profiles apply budget   # after the human confirms
```

Do not put API keys in this skill. Do not auto-apply a paid profile without confirm.
If `magpie profiles recommend` opens a TUI or hangs, the installed build is too old —
upgrade `@naiemk/magpi` before continuing.

## How to start

1. Write a short `plan.md` (Layer 1):
   - `## Goal`
   - `## Missing inputs` or constraints / stop rules
   - `## Plan` — numbered coarse steps (scout / review / harvest kinds OK)
   - Do **not** include `click(`, CSS selectors, or "type into …"
2. Compact yield (no TUI wait):

```bash
magpie --json --session-dir "$MAGPIE_SESSION_DIR" --plan-file plan.md "<objective>"
```

Default session dir is Magpie home (`~/.browser-agent-core/pi-sessions`). On Grok Bot
Agent Computer use `--session-dir /workspace/magpie/sessions`.

3. Parse the last stdout line as JSON. Keep `session_id` and `goal_id`.
4. Stop. Do not harvest in your own browser. Do not start a second Magpie session.

## Status and instructions

When a Magpie session is already live for this job, **every** follow-up uses that
`session_id`. This includes status checks **and** refinements such as "ignore
agencies", "only founders", tighter criteria, or "also look elsewhere."

```bash
magpie --json --session-dir "$MAGPIE_SESSION_DIR" --session <session_id>
magpie --session-dir "$MAGPIE_SESSION_DIR" --session <session_id> -p "<instruction or status>"
```

Rules:

- A refinement is an instruction to the existing worker, **not** a new harvest start.
- Do **not** write a new `plan.md` and call `magpie --json` without `--session` while
  a session id for this job is live.
- Never mint a second session for the same job.
- Prefer Magpie's `next_check_hint` when unsure what to run next.

## Standing rules

- One Magpie start per harvest job.
- The client-facing handle is Pi's session id Magpie printed — revive it with `--session`.
- After delegate, do **not** browse / scrape the harvest yourself in parallel.
- Do not teach ACP in-memory session ids as the durable Magpie handle.

## Durable Pi-session jobs vs one-shot ACP

- **Long Magpie job (this skill):** `magpie --json` → keep `session_id` → status/instruct.
- **One-shot ACP harness:** `npx -y browser-session-agent acp` — short verdict/evidence.
  Do **not** send multi-site harvest campaigns into the ACP path by default.
