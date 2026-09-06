# Browser harness

When the job is a browsing task, spawn this harness. Do not drive the browser yourself.

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

This is a browser harness other agents delegate to, the same way they spawn a coding
agent over ACP. It is not chrome-devtools-mcp and not a bundled `browser` plugin.
