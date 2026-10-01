# Epic: Computer use (R8)

Status: **R8.1 landed (CU-01-T01). T02–T05 open.** P2. Does not displace P0 (R2.E3 / R2.3) or named P1 perf.
Spec: [`docs/computer-use.md`](../../docs/computer-use.md). Decision: D61.

## Outcome

Harvest uses browser tools and computer tools in one loop. `see` lists windows and
shows one image of the focused window. `use` clicks, types, scrolls, or focuses.
The latest tool result says whether the next action is `act` or `use`. A captcha
continues while the widget advances and stops before a lockout.

## Risks

- Screenshot-every-click, which bills the harvest as a pixel loop and throws away D52.
- A second agent or a `/computer` mode, so the switch stops being a tool call.
- Treating a captcha miss as a reason to call a stronger model or open a new session.
- Starting CU-01 while R2.E3 / R2.3 are the queue.

## Stories

- [CU-01: Harvest computer tools](../stories/cu-01-harvest-computer-tools.md)

## Tasks

| Task | Spec | Status |
| --- | --- | --- |
| [CU-01-T01](../tasks/cu-01-t01-see-use.md) | `see` / `use` / `focus` on harvest only | **done** |
| [CU-01-T02](../tasks/cu-01-t02-image-budget.md) | crop, cap, hash gate, one live image | todo |
| [CU-01-T03](../tasks/cu-01-t03-channel-switch.md) | tool result names `act` or `see` | todo |
| [CU-01-T04](../tasks/cu-01-t04-vision-escalation.md) | one stronger-pin turn, then ask | todo |
| [CU-01-T05](../tasks/cu-01-t05-captcha-progress.md) | continue while the widget advances | todo |

## Out of scope

App-skill catalog, desktop accessibility tree, set-of-marks, computer tools during scout or coach.
