---
id: AGENT-11-T02
title: Peek and side tabs refuse a data document
story: AGENT-11
epic: agent
status: done
---

# AGENT-11-T02 — Peek and side tabs refuse a data document

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D17, D21, D22
- AGENT-10-T03 / T04 already refuse on navigate and probe
- Live run: peek and side-tab of `file://…json` were `matched: true` with empty controls; probe then said not a page

## Possible

- `src/core/peek.ts` — URL match only
- `src/runtime/tools.ts` — `side_tab_open` observes and stays
- `src/core/perspective.ts` — stranger observe with no document check
- `src/runtime/card.ts`

## Do

1. After opening a side tab, if `facts().document.kind === "data"`, do not treat it as a page: `matched` false (peek), error and close (side-tab), error not a snapshot (stranger). Include content type and byte length. Do not return the body.
2. Peek an HTML URL with `until: "stable"` (T01). Classify data documents before waiting the budget.
3. One card sentence: do not peek `file://` or scratch files; ask coder to return a digest. No `scratch_read` tool.

## Tests

- `tests/e2e/core-peek.test.ts` — peek `/api/search` is not matched, result does not contain `users` / `User 12`, note mentions json and bytes.
- Same file or `tests/e2e/core-perspective.test.ts` — stranger view of that URL does not dump the payload.
- Side-tab open of the JSON fixture errors and does not leave a working side tab.

## Done when

A JSON tab cannot be reported as a successful peeked or side page. HTML peeks still work. The card mentions scratch vs coder, not a new parent read tool.
