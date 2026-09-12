# Grok Bot / parent-agent feasibility

Status: **research dump for PARENT-00-T01.** Citation pass 2026-09-13.
RESEARCH-09 is the only executable Magpie canary. Live Bot-computer facts stay
for PARENT-02-T01. Do not treat this as R6 shipped.

Authority: [`docs/parent-agent.md`](parent-agent.md).

Citations used below:

- [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- [Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)
- [FAQ](https://docs.x.ai/grok-bot/faq)
- [Grok Build MCP servers](https://docs.x.ai/build/features/mcp-servers)
- [Grok Build plugin marketplace](https://x.ai/news/grok-plugin-marketplace)
- Cursor [Work with Grok Bot](https://cursor.com/docs/grok-bot/work)

## RESEARCH-01 … RESEARCH-08

| ID | Question | Status | Notes |
| --- | --- | --- | --- |
| RESEARCH-01 | Grok Bot stdio MCP via `npx`? | **inferred / unverified for Bot** | **Grok Build** documents `grok mcp add … -- npx -y …` and `[mcp_servers]` in `~/.grok/config.toml` ([Build MCP](https://docs.x.ai/build/features/mcp-servers)). Grok Bot docs describe Plugins/connectors and the Agent Computer, not a Bot-side `npx` MCP installer. Magpie parent MVP stays CLI; MCP does not block T01–T03. |
| RESEARCH-02 | Skill install from URL/repo vs marketplace? | **verified (docs) + distribution pattern** | Grok Bot: Settings → Plugins marketplace / packaged skills; enable private skills under Plugins → Yours; save from chat; Teach a task (draft). Type `/` to reference. ([Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)). There is **no** documented Grok Bot “paste GitHub URL into Plugins to install a skill” path. **T04 copy:** paste the thin bootstrap in `skills/magpie-parent/GROK_BOT.md`, then have the Bot **curl** the canonical `SKILL.md` from raw.githubusercontent (Agent Computer fetch) so updates stay on git. Do **not** maintain a forked long procedure only inside the Bot. A GitHub/URL **plugin marketplace** install path is documented for **Grok Build**, not Grok Bot ([plugin marketplace](https://x.ai/news/grok-plugin-marketplace)). |
| RESEARCH-03 | Bot computer persistence (`/workspace` vs `~`)? | **inferred (docs)** | Shared Agent Computer; durable files under `/workspace`; browser cookies/sessions shared across Bots; temp dirs and manually installed packages are replaceable ([computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)). Magpie default `--session-dir` remains `coreRoot()/pi-sessions`; Bot override `/workspace/magpie/sessions` is still the skill recommendation. **Node / Playwright / Chrome versions on the Bot image: unverified** (PARENT-02-T01). |
| RESEARCH-04 | Pi `/login xai` vs Magpie `createLiveModel` | **unverified** | Magpie `KEY_ENV_NAMES` has no xAI today; durable host gated on env keys. Device-code on a headless Bot VM not exercised. Not required for the CLI session handle. |
| RESEARCH-05 | Cursor Grok Bot entitlement vs SuperGrok OAuth | **inferred (docs)** | FAQ: eligible plans include SuperGrok Plus/Heavy and Cursor Pro+/Ultra/Teams; if both Cursor and SuperGrok, Bot uses whichever has more usage ([FAQ](https://docs.x.ai/grok-bot/faq)). That is **usage entitlement**, not proof that Pi `/login xai` or `api.x.ai` keys are the same. **Do not promise no-API-key Magpie harvest to every Bot user.** |
| RESEARCH-06 | Terms for subscription OAuth from third-party agent | **unverified** | Sharing a Bot accepts third-party bot terms ([FAQ](https://docs.x.ai/grok-bot/faq)); Magpie→Grok subscription OAuth from a third-party agent is not covered. Not an R6 exit. |
| RESEARCH-07 | Magpie Chromium on Bot `DISPLAY`? | **unverified** | Bot has an Agent Computer with browser and takeover for CAPTCHA/2FA ([computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)). Whether Magpie’s Playwright Chrome appears on that display is untested. |
| RESEARCH-08 | Grok Bot routines polling `magpie --session … -p status`? | **inferred (docs)** | Routines can schedule skills and run while the laptop is closed; event triggers exist ([Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)). Push notify from Magpie is assumed unavailable. Whether a routine can reliably poll Magpie CLI status is **unverified** live. |
| RESEARCH-10 | Submit a third-party plugin / packaged skill for Grok Bot? | **verified (docs) — Bot vs Build split** | **Grok Bot:** no public self-serve “submit a plugin/skill” form in official docs. Bot Plugins marketplace / packaged skills appear **curated**; private skills are save-from-chat / Teach a task / Yours. Third-party Bot marketplace tiles (when present) are staff-added; contact xAI for listing — not a PR path. **Share as template** distributes a whole Bot, not a skill catalog entry. **Grok Build (separate product):** open catalog — PR to [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) adding one entry to `.grok-plugin/marketplace.json`, pin a full 40-char commit SHA for remote sources, regenerate `plugin-index.json`, pass `validate-catalog.py` + code-owner review ([CONTRIBUTING](https://github.com/xai-org/plugin-marketplace/blob/main/CONTRIBUTING.md), [news](https://x.ai/news/grok-plugin-marketplace)). Magpie parent MVP stays Bot bootstrap + git-fetched `SKILL.md`; a Build marketplace plugin is optional later and does **not** replace Bot distribution. |

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

## Implication for T04 distribution

Ship a **thin Grok Bot bootstrap** (`skills/magpie-parent/GROK_BOT.md`) to paste /
save-from-chat / Teach a task. The Bot then **fetches** canonical
`skills/magpie-parent/SKILL.md` from raw.githubusercontent on the Agent Computer
before Magpie work. Do not maintain the long procedure only inside a Bot private
skill, and do not document a Grok Bot “install from this GitHub URL” Plugins path
(that is Grok Build). See RESEARCH-10 for submitting to Grok Build’s marketplace
vs Bot curation.

## Out of scope here

Installer, Magpie MCP adapter, live Grok Bot install notes (PARENT-02-T01), OpenRouter
supervisor proxy implementation (PARENT-01-T03 / R6.E2 — separate ticket).
