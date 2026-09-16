# Epic: Hosted canvas (AG-UI)

Status: **in progress (WEB-01-T01 sitemap landed; T02 import open).** Parallel Track C.
Does not replace R1.E2, E-QUAL, or R6. Spec: [`docs/web-ux-sitemap.yaml`](../../docs/web-ux-sitemap.yaml).

## Outcome

The hosted operator is a **run canvas**, not a chat with a live-view sidebar. Human–agent
work that is not a sentence lives on a **slider** (interrupts, scratch upload/list/download,
takeover, closed-catalog surfaces). Chat is a dock. The coder emits AG-UI from a **baseline
skill + vendored encoder** — no `npm install` in scratch.

AG-UI is the event protocol ([docs.ag-ui.com](https://docs.ag-ui.com)). Magpie keeps chrome.
We do not adopt CopilotKit as the app. `threadId` stays the Pi `goal_*` (D59).

## Risks

- Polishing [`src/hosts/web/public/app.js`](../../src/hosts/web/public/app.js) instead of replacing the IA.
- Letting the child ship HTML (eval / iframe). Catalog is closed; A2UI-style JSON only.
- Standing up a second SSE bus next to `/chat`. Reuse the WebSocket; middleware-map Pi events.
- Minting AG-UI session ids beside Pi sessions (D59).
- Importing CopilotKit/React into the vanilla hosted shell as the first slice.
- Parent ingesting the coder transcript to “show UI” (D29). Surfaces are files or activities.
- Blocking harvest quality work (R1.E2) on this chrome.

## Stories

- [WEB-01: Sitemap, design contract, AG-UI import](../stories/web-01-agui-shell.md)

## Tasks

| Task | Spec | Status |
| --- | --- | --- |
| [WEB-01-T01](../tasks/web-01-t01-sitemap-and-design.md) | sitemap YAML + AG-UI mapping | **done** (this epic’s design guideline) |
| [WEB-01-T02](../tasks/web-01-t02-import-agui-baseline.md) | vendor encoder + coder skill on spawn | todo |

## Definition of done (epic)

- Hosted shell matches the sitemap regions (rail, canvas, slider, dock).
- Slider owns HITL + scratch files; `ui_request` is not a chat card.
- Coder can emit a catalog surface in one spawn without installing packages.
- Existing pair / live / takeover / durable contracts still work.

## Cross-epic

- D12 floors, D29 digest, D31 files win, D59 Pi session id.
- Scratch paging already exists (`scratch_read` offset). This epic **surfaces** it.
- Persistent coder `--session-id` stays off (`ideas/resume-from-scratch.md`).
