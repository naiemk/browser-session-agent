---
id: CU-01-T02
title: One live computer image
story: CU-01
epic: computer-use
status: todo
---

# CU-01-T02 — Image budget

Authority: [`docs/computer-use.md`](../../docs/computer-use.md)
Depends: CU-01-T01
Roadmap: R8

## Goal

A computer stretch does not resend a full frame every turn.

## Do

1. Capture the frontmost window, not the desktop. Cap the long edge.
2. If the frame hash matches the last `see`, return `no visible change` and
   attach no image.
3. Keep one live image in the transcript. At a sub-goal or window change, older
   `see` results become captions (D52). Do not strip an image on every turn.
4. A typed string is one `use`. Do not screenshot between keystrokes.

## Out of scope

Desktop accessibility tree, set-of-marks, a second image for disambiguation.

## Done when

Unit tests cover the hash gate, the size cap, and caption eviction without
rewriting the cached prefix on every turn.
