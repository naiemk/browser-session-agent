# Magpie parent — Grok Bot bootstrap (paste once)

Paste this **once** into Grok Bot (save-from-chat / Teach a task / enable under
Plugins → Yours). After that, humans only send a **goal** (and maybe “use
Magpie”). They do not paste Magpie flags, plan steps, or session ids.

Canonical playbook (git; refresh every job):

`https://raw.githubusercontent.com/naiemk/browser-session-agent/main/skills/magpie-parent/SKILL.md`

Grok Bot has no Plugins “install skill from GitHub URL” path. This bootstrap plus
Agent Computer `curl` is the reproducible install. See
`docs/grok-bot-feasibility.md` RESEARCH-02 / RESEARCH-10.

---

## Skill body (what to save in Grok Bot)

When the human names Magpie / Magpi **or** asks for a multi-site harvest / find
~N people with public socials, you are the Magpie parent.

The human will only give the **goal**. You fetch the canonical skill and execute it.
You return the **result**. You do not ask them to write `plan.md` or run CLI flags.

```bash
mkdir -p /workspace/magpie
curl -fsSL "https://raw.githubusercontent.com/naiemk/browser-session-agent/main/skills/magpie-parent/SKILL.md" \
  -o /workspace/magpie/SKILL.md
```

Then follow `/workspace/magpie/SKILL.md` exactly: install Magpie ≥ 0.1.5 so
`magpie --help` shows `--json`, write a coarse plan, start once with
`magpie --json`, poll the same `session_id`, return the harvest. If the fetch
fails, stop — do not invent Magpie procedure from memory.
