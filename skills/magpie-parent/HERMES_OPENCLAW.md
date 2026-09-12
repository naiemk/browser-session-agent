# Magpie parent — Hermes / OpenClaw package

Same contract as Grok Bot: the human sends a **goal**; you fetch and follow
`skills/magpie-parent/SKILL.md`. Do not fork Magpie rules into a host-local paste.

```text
https://raw.githubusercontent.com/naiemk/browser-session-agent/main/skills/magpie-parent/SKILL.md
```

Until that path exists on `main`:

```text
https://raw.githubusercontent.com/naiemk/browser-session-agent/cursor/r6-on-main-0.1.5/skills/magpie-parent/SKILL.md
```

## Host chrome

- Prefer a checkout of this repo; otherwise `curl` the raw URL and follow that file.
- Install: `npm install -g @naiemk/magpi` (need **≥ 0.1.5** for `--json` /
  `profiles`). Binary is `magpie`.
- Grok Bot session dir is `/workspace/magpie/sessions`; elsewhere Magpie’s default
  is fine unless `MAGPIE_SESSION_DIR` is already set.
- One-shot ACP is Mode A (`npx -y browser-session-agent acp`); long harvests are
  Mode B (`magpie --json`). See `skills/browser-harness/SKILL.md`.
