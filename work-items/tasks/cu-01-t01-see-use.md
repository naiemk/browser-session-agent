---
id: CU-01-T01
title: see and use on the harvest tool list
story: CU-01
epic: computer-use
status: done
---

# CU-01-T01 — see and use

Authority: [`docs/computer-use.md`](../../docs/computer-use.md)
Roadmap: R8, behind P0 and P1

## Goal

Harvest can list windows, focus one, and act on it. The next `observe` still
returns browser refs.

## Do

1. Register `see` and `use` only while the harvest phase tools are active.
   Scout and coach keep the browser set.
2. `see` returns a text window list and one image of the focused window.
   `use` accepts `click`, `type`, `key`, `scroll`, and `focus` (raise or launch
   by title from that list) and returns the next `see`.
3. `observe` and `act` stay registered during harvest.
4. After `use` leaves Chrome, reattach the browser worker over CDP so the next
   `observe` returns refs. Coordinates from `see` are not refs.
5. Fake window port in unit tests. No live desktop in CI.

## Out of scope

Image budget (T02), channel line (T03), model pin (T04), captcha policy (T05).

## Done when

A unit test focuses a fake window, returns a `see`, and a following `observe`
still has refs.
