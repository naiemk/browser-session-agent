# Magpie parent — Grok Bot bootstrap (paste once)

This file is the **only** text you paste into Grok Bot (save-from-chat / Teach a
task / enable under Plugins → Yours). It is intentionally thin.

**Do not** paste a long Magpie procedure into the Bot and keep editing it there.
The full skill lives in git. Everyone refreshes from the same URL so updates are
reproducible.

Canonical skill (source of truth):

- Stable (after PR #70 merges):  
  `https://raw.githubusercontent.com/naiemk/browser-session-agent/main/skills/magpie-parent/SKILL.md`
- Until then:  
  `https://raw.githubusercontent.com/naiemk/browser-session-agent/cursor/r6-on-main-0.1.5/skills/magpie-parent/SKILL.md`
- Repo path: `skills/magpie-parent/SKILL.md` in
  [naiemk/browser-session-agent](https://github.com/naiemk/browser-session-agent)

Grok Bot has **no** documented “install skill from GitHub URL” Plugins path.
Private skill = paste this bootstrap (save-from-chat / Teach a task / Yours).
Canonical Magpie rules stay on git — refresh via the curl below. See
`docs/grok-bot-feasibility.md` RESEARCH-02 / RESEARCH-10.

---

## Skill body (what to save in Grok Bot)

You are installing / using **Magpie parent**. Magpie is the browser worker; you
supervise via CLI. You do not click/type/CSS yourself.

### Every Magpie job — refresh the canonical skill first

```bash
mkdir -p /workspace/magpie
CANONICAL_URL="https://raw.githubusercontent.com/naiemk/browser-session-agent/main/skills/magpie-parent/SKILL.md"
FALLBACK_URL="https://raw.githubusercontent.com/naiemk/browser-session-agent/cursor/r6-on-main-0.1.5/skills/magpie-parent/SKILL.md"
if ! curl -fsSL "$CANONICAL_URL" -o /workspace/magpie/SKILL.md; then
  curl -fsSL "$FALLBACK_URL" -o /workspace/magpie/SKILL.md
fi
# Follow /workspace/magpie/SKILL.md for all Magpie rules. Do not invent CLI flags.
```

If both URLs fail, stop and tell the human the skill fetch failed (do not improvise
a Magpie parent procedure from memory).

Optional: after a successful fetch, ask the human to save an updated private skill
from that file so `/` picks up new rules — still re-fetch before long harvests.

### One-time Agent Computer setup

Need **Node ≥ 24**. Magpie **≥ 0.1.5** for `--json` / `profiles` (0.1.4 and earlier
open the TUI and hang headless).

```bash
npm install -g @naiemk/magpi@0.1.5
export MAGPIE_SESSION_DIR=/workspace/magpie/sessions
mkdir -p "$MAGPIE_SESSION_DIR"
magpie --help | head -40   # must show --json / profiles
```

Harvest follow-ups need a Magpie provider key (`OPENROUTER_API_KEY` or Magpie
`/login`). Parent `--json` start does not need Chrome.

Do **not** run bare `magpie` without confirming `--json` is in help.

### Then

Follow the fetched `SKILL.md` exactly: write coarse `plan.md`, start once with
`magpie --json --session-dir "$MAGPIE_SESSION_DIR" --plan-file …`, keep
`session_id` / `goal_id`, status/instruct only via `--session`, never parallel
browse the harvest yourself.
