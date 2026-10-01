---
id: CU-01-T04
title: One stronger see after no visible change
story: CU-01
epic: computer-use
status: todo
---

# CU-01-T04 — Vision escalation

Authority: [`docs/computer-use.md`](../../docs/computer-use.md)
Depends: CU-01-T01, CU-01-T02
Roadmap: R8

## Goal

An ordinary window that did not move gets one look from a stronger vision pin,
then the harvest model returns.

## Do

1. `see` and `use` run on the harvest pin.
2. When `use` returns `no visible change` and the detector does not say captcha,
   switch to the vision pin for one `see` and one `use`. Restore the harvest pin
   after that turn.
3. A second miss calls `ask_user`. Do not escalate again.
4. The vision pin receives the same cropped image. It does not receive a desktop
   screenshot or a captcha retry.

## Done when

Unit tests: one escalation, pin restored, second miss asks, captcha path does
not enter this pin (that path is CU-01-T05).
