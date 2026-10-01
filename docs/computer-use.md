# Computer use (R8)

Status: R8.1 (`see` / `use`) landed. R8.2–R8.5 are not implemented. Priority:
**P2**. Do not start those while P0 (R2.E3 / R2.3) and the named P1 perf wins
own the cycle.
Tickets: [`work-items/epics/computer-use.md`](../work-items/epics/computer-use.md).
Decision: D61.

## Operator

During harvest, Magpie uses the browser tools and the computer tools in one loop.
The latest tool result names which channel can see the target. There is no mode
command and no second agent.

Scout and coach do not receive computer tools.

## Tools

Same harvest agent as `observe` / `act`. Both pairs stay registered for the whole
harvest.

| Tool | Returns | Accepts |
| --- | --- | --- |
| `see` | A text window list (app, title, which is focused) and one image of the focused window | Nothing |
| `use` | The next `see` | `click` at a point, `type`, `key`, `scroll`, `focus` |

`focus` raises a window by title from that list, or launches an app that is not
running. The image after `focus` is the window that is now in front. Two windows
with the same title return the titles and no second image.

The harness performs the action (D17). Coordinates from `see` are not refs and
must not be passed to `act`. After a computer action on another window, the
browser worker reattaches over CDP so the next `observe` returns refs.

## Which tool next

Written on the tool result, not as a plan step:

- After `observe`, a named control means `act`.
- After `observe`, no named control means `see`.
- After `see` or `use`, if the frontmost window is Chrome and `observe` can name
  controls, use `act`.
- Otherwise stay on `use`.

A harvest turn may be `observe` → `act` → `see` → `use` → `observe` → `act` →
`remember`. Facts from either channel go through `remember`.

## Image budget

Same rule as the browser snapshots (D52, D53): the model sees a change, not a frame.

- Capture the frontmost window, not the desktop. The window list is text.
- Cap the long edge (about 1280). Do not send a retina-scale frame.
- If the frame hash matches the last one, return `no visible change` and attach
  no image.
- Keep one live image. Older `see` results become captions when the window or
  the sub-goal changes. Do not strip the oldest image on every turn.
- Several `use` actions may run before the next image when nothing visual has
  to be checked between them (a typed string is one action).
- If the focused OS control has a name, the harness clicks that name. Spend an
  image when the control has no name.

## Escalation

The harvest pin runs `see` and `use`. After `no visible change` on an ordinary
window (not a captcha), one stronger vision pin gets one `see` and one `use`,
then the harvest pin returns. A second miss calls `ask_user`. The stronger pin
sees the same cropped image. It is not a second captcha pass and not a full
desktop.

## Captcha

A captcha is a computer-use stretch inside the same harvest, not a solver
service and not a new session.

A round is one `see` of the current prompt and one `use` that submits the
selection. Continue while the next `see` shows a new prompt, an accepted
selection, or the challenge gone. Then return to `observe` and `act`.

Stop and hand the window to the person when any of these is true:

- The same prompt is back after an answer (frame hash matches, or the widget
  regenerated the same task).
- The widget resets, swaps to a harder check, or repeats a failure on the next round.
- The page leaves the challenge and shows a rate limit, a lockout, or an
  unusual-traffic wall.
- This profile has already tripped the session challenge breaker.

Do not open a new session to retry a live block. Model confidence does not
extend the loop. Visible advance does.

Fingerprint spoofing, proxy rotation, and bypass services stay out (challenge
doc non-goals). Credentials, OTP, and payment confirm still park for the person.

## Out of this release

App-skill catalog, desktop accessibility tree, set-of-marks, a second agent,
computer tools during scout or coach.
