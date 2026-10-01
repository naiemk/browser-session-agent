# CU-01: Harvest computer tools

Status: todo

As an operator mid-harvest, Magpie can leave Chrome for another window and come
back, without a slash command. If a captcha is advancing, it keeps answering.
If the widget repeats itself or the site starts blocking, it hands me the window.

## Acceptance criteria

- `see` and `use` exist on the harvest tool list and not on scout or coach.
- `observe` and `act` stay available during harvest.
- A tool result names the next channel.
- An unchanged frame does not attach an image.
- One stronger-pin turn follows `no visible change` on an ordinary window; the next miss asks.
- A captcha continues while it advances and parks on the D61 stop conditions.

## Spec

[`docs/computer-use.md`](../../docs/computer-use.md) · [`../epics/computer-use.md`](../epics/computer-use.md)

## Tasks

- [CU-01-T01](../tasks/cu-01-t01-see-use.md)
- [CU-01-T02](../tasks/cu-01-t02-image-budget.md)
- [CU-01-T03](../tasks/cu-01-t03-channel-switch.md)
- [CU-01-T04](../tasks/cu-01-t04-vision-escalation.md)
- [CU-01-T05](../tasks/cu-01-t05-captcha-progress.md)

## Done when

T01 through T05 are green. The release claim is a harvest that switches channels, not a skill catalog.
