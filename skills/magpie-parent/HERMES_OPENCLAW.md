# Magpie parent — Hermes / OpenClaw package

Same Magpie CLI contract as other hosts. Canonical procedure is **only**
`skills/magpie-parent/SKILL.md` in
[naiemk/browser-session-agent](https://github.com/naiemk/browser-session-agent)
(or the raw URL below). Do not fork Magpie rules into a host-local paste.

```text
https://raw.githubusercontent.com/naiemk/browser-session-agent/main/skills/magpie-parent/SKILL.md
```

Until that path exists on `main`, use the R6 branch tip:

```text
https://raw.githubusercontent.com/naiemk/browser-session-agent/cursor/r6-on-main-0.1.5/skills/magpie-parent/SKILL.md
```

## Host chrome

- Prefer a checked-out clone of this repo when available; otherwise `curl` the raw
  URL into the agent workspace and follow that file.
- Install Magpie: `npm install -g @naiemk/magpi` (need **≥ 0.1.5** for `--json` /
  `profiles`). CLI binary is `magpie`.
- Set `MAGPIE_SESSION_DIR` if you are not using Magpie's default
  `~/.browser-agent-core/pi-sessions`.
- One-shot ACP remains Mode A (`npx -y browser-session-agent acp`); long harvests
  are Mode B (`magpie --json` …). See `skills/browser-harness/SKILL.md`.

Then follow the fetched / checked-out `SKILL.md` exactly.
