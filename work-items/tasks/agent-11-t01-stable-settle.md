---
id: AGENT-11-T01
title: Navigate and peek wait until the snapshot is stable
story: AGENT-11
epic: agent
status: done
---

# AGENT-11-T01 — Navigate and peek wait until the snapshot is stable

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D17, D29
- Live run `goal_mtpnwou0001`: t6 0 controls then t7 40; t9 chrome-only then probe; t39 1 control then t40 a profile

## Possible

- `src/core/settle.ts` — a pass is trusted on the first read
- `src/core/act.ts` — navigate uses that settle
- `src/core/peek.ts` — one `facts()` and return

## Do

1. Add `SettleOptions.until`: `"pass"` (default) or `"stable"`.
2. `"stable"`: a pass is not final until two consecutive successful reads agree on URL and `controls.length`, or the budget ends. Then return the last pass.
3. Navigate, peek, and side-tab open use `"stable"`. Click, type, wait, scroll, and `check` stay on `"pass"`.
4. Do not require a non-chrome control. A 0-control page that stays 0-control still passes after the budget.

## Tests

- `tests/unit/core-settle.test.ts` — `"pass"` still returns on the first yes; `"stable"` keeps reading while the control count changes, and stops when two reads agree.
- `tests/e2e/core-late-page.test.ts` or a sibling — fixture HTML that paints its main button ~400 ms after load; navigate with `settleMs: 0` misses it; default navigate includes it. Click settle behaviour on `/late` is unchanged.

## Done when

A URL that landed before the SPA painted is not reported as a finished page. Check and click still cost one read on a first-look pass.
