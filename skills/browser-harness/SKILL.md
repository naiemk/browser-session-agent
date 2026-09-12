# Browser harness

Two modes. Pick explicitly. Do not send long Magpie harvest jobs into ACP by default.

## Mode A — one-shot ACP (short verdict)

When the job is a **short** browsing task that should return a verdict/evidence id:

```
npx -y browser-session-agent acp
```

Speak Agent Client Protocol on stdio. Send a goal, a start URL, a policy, and criteria.
Get a verdict, checks, and an evidence id. Do not call click, type, or observe — those
stay inside the harness.

- `session/new` with `url`, `policy` (`ask` | `auto` | `never`), optional `criteria`
- `session/prompt` with the goal as text
- Committing actions under `ask` arrive as `session/request_permission`
- Park (captcha, 2FA) is a waiting outcome, not a success
- Evidence is on disk under the returned `goalId`

ACP `session/new` ids are **in-memory** for that harness run. They are not Magpie's
durable Pi session handle.

## Mode B — long Magpie Pi-session job

When the job is a multi-site harvest / qualify campaign that must survive process
exit, use Magpie parent CLI (`skills/magpie-parent/SKILL.md`):

```bash
magpie --json --session-dir … --plan-file plan.md "<objective>"
```

Keep the printed `session_id`. Later: `magpie --session <id> -p "…"`. Do not drive
the browser yourself. Do not harvest in parallel with Magpie.

This skill is not chrome-devtools-mcp and not a bundled `browser` plugin.
