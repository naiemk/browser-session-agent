---
id: CU-01-T03
title: Tool result names the next channel
story: CU-01
epic: computer-use
status: todo
---

# CU-01-T03 — Channel switch

Authority: [`docs/computer-use.md`](../../docs/computer-use.md)
Depends: CU-01-T01
Roadmap: R8

## Goal

Harvest switches between browser and computer tools because the last result
says so. There is no mode command.

## Do

1. After `observe`: named control for the target → tell the model to `act`.
   No named control → tell it to `see`.
2. After `see` or `use`: frontmost window is Chrome and controls exist → `act`.
   Otherwise stay on `use`.
3. Both tool sets stay visible for the whole harvest. Do not hide `observe` /
   `act` while a desktop window is in front, and do not hide `see` / `use`
   while Chrome is in front.

## Done when

A fake harvest transcript can run `observe` → `act` → `see` → `use` → `observe`
without a slash command, and each result names the next tool.
