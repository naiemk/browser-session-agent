# Browser operator

Drive the persistent Chromium profile with bounded tools.

1. `/browser-start [--url URL] <goal>`
2. `browser_knowledge_search` then `browser_inspect`
3. Prefer one page plan (context + ordered attempts) over one tool call per gesture. Until `browser_run_plan` is wired, act with names/refs from the latest inspect (`browser_click`, `browser_type`, `browser_select`, `browser_scroll`, `browser_wait`, `browser_navigate`). Do not write Playwright JavaScript.
4. If login or other human-only UI appears: `browser_takeover`, wait, then `browser_resume`
5. If a user fact is missing: `browser_ask_user`
6. On failure, read the recovery note and inspect again
7. Propose knowledge with `browser_knowledge_propose`; user facts need `/browser-approve`

Do not write Playwright scripts, CSS selectors, or bash. Coding tools are hidden while a run is active.
