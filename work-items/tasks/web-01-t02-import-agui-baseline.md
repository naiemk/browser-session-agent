---
id: WEB-01-T02
title: Import AG-UI into the product baseline (coder skill, no scratch install)
story: WEB-01
epic: web-ux
status: todo
---

# WEB-01-T02 — Import AG-UI baseline

Authority: [`docs/web-ux-sitemap.yaml`](../../docs/web-ux-sitemap.yaml) `coder_baseline`
Depends: WEB-01-T01
Roadmap: Track C / R7.2

## Goal

The coder can emit a catalog surface in **one** spawn. No `npm install` in scratch,
no extra slice for tooling. The hosted parent can decode those events. Magpie TUI
is unchanged.

## Do

1. Add workspace deps: `@ag-ui/core`, `@ag-ui/encoder` (and `@ag-ui/client` only if
   the hosted mapper needs it). Pin versions. Do **not** add CopilotKit as the app.
2. Package `skills/ag-ui-surfaces/SKILL.md`: closed catalog, write JSONL under
   `scratch/ui/`, files win, no HTML, no parent transcript dump.
3. `buildChildInvocation` / `runWorker`: for `agent=coder` only, pass
   `--skill <packaged skill path>`. Keep `--no-session`. Planner/writer/reviewer stay
   without the skill.
4. Thin host mapper stub or types so websocket code can be adapted later; a full
   canvas shell is **not** this ticket.
5. Unit tests: coder argv includes `--skill`; skill text forbids `npm install` and
   raw HTML; encoder round-trip of one `ACTIVITY_SNAPSHOT` fixture.

## Out of scope

- Replacing `index.html` / chat layout (later story).
- Persistent coder Pi session.
- A2UI middleware / CopilotKit runtime.
- Parent ingesting child jsonl chat.

## Done when

A FakePi/coder spawn has the skill on argv, the packages resolve from the repo, and
a fixture surface file is valid AG-UI JSONL without installing anything in a temp cwd.
