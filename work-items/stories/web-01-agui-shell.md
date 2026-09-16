# WEB-01: AG-UI canvas shell

Status: in progress (T01 done; T02 open)

As an operator on the hosted web app, I work a **canvas** (live browser + agent
surfaces) and a **human slider** (asks, gates, scratch files, takeover). I do not
live in a chat log. The coder can drop a table or file tray onto that canvas
without an install turn.

## Acceptance criteria

- A sitemap YAML names routes, regions, the slider, scratch, and a closed widget catalog.
- AG-UI event mapping is written (today’s `stateSync` / `ui_request` / `agentEvent` → AG-UI).
- Design forbids raw HTML from the child and a second session namespace.
- Import task exists: `@ag-ui/core` + encoder as workspace deps; coder skill on spawn; no scratch `npm install`.

## Spec

[`docs/web-ux-sitemap.yaml`](../../docs/web-ux-sitemap.yaml) · [`../epics/web-ux.md`](../epics/web-ux.md)

## Tasks

- [WEB-01-T01](../tasks/web-01-t01-sitemap-and-design.md)
- [WEB-01-T02](../tasks/web-01-t02-import-agui-baseline.md)

## Done when

T01 is merged (guideline). T02 is merged (coder can emit). Shell implementation is a later story; do not pretend T01 paints pixels.
