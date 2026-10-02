---
id: CU-01-T05
title: Captcha rounds while the widget advances
story: CU-01
epic: computer-use
status: todo
---

# CU-01-T05 — Captcha progress

Authority: [`docs/computer-use.md`](../../docs/computer-use.md), D61,
[`docs/challenge-and-approval-handling.md`](../../docs/challenge-and-approval-handling.md)
Depends: CU-01-T01, CU-01-T02, CU-01-T03
Roadmap: R8

## Goal

A captcha is answered for as long as it changes, and handed to the person when
another try would risk a block.

## Do

1. When the challenge detector classifies a captcha, stay on `see` / `use`.
   A round is one `see` and one `use` that submits the selection.
2. Continue when the next `see` is a new prompt, an accepted selection, or the
   challenge gone. On gone, return to `observe` / `act`.
3. Stop for takeover when the frame hash matches the previous prompt, the widget
   resets or repeats a failure, the page shows a rate limit or lockout, or the
   session challenge breaker is already open.
4. Do not call the vision pin from CU-01-T04. Do not open a new session to retry
   a live block. This is not a solver client.

## Done when

Fixture rounds advance twice and then stop on a repeated prompt, and a lockout
page parks without another `use`.
