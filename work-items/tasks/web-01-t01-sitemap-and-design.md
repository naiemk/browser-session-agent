---
id: WEB-01-T01
title: Site map YAML and AG-UI design contract
story: WEB-01
epic: web-ux
status: done
---

# WEB-01-T01 — Site map YAML and design contract

Authority: [`docs/web-ux-sitemap.yaml`](../../docs/web-ux-sitemap.yaml)
Epic: [`../epics/web-ux.md`](../epics/web-ux.md)
Roadmap: Track C / R7.1

## Goal

A versioned sitemap that a later implementation PR cannot “interpret” back into
chat + status bar. Records AG-UI as the protocol, the human slider, scratch as a
file tray, and a closed generative-UI catalog.

## Do

1. Write [`docs/web-ux-sitemap.yaml`](../../docs/web-ux-sitemap.yaml): current shell,
   target routes/regions, slider sections, catalog allow/deny, websocket → AG-UI map,
   coder baseline, out of scope.
2. Point the release roadmap at Track C without displacing R1.E2 / E-QUAL / R6.
3. Do not restyle `app.js` in this task. Do not `npm install` AG-UI here (T02).

## Tests

- Unit: sitemap file exists and names required region ids
  (`session-rail`, `canvas`, `human-slider`, `transcript-dock`, `scratch`)
  and the closed catalog deny list (raw HTML).

## Done when

The YAML is on `main` and the unit check is green. Implementation of the shell is
not this ticket.
