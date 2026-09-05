# Ideas

A waiting room. Ideas live here until they are mature enough to become an epic under `work-items/epics/`.

This is not `docs/` (accepted design) and not `work-items/` (committed scope). An idea can be wrong, premature, or in tension with an existing decision. The point of the folder is to have that argument in writing instead of rediscovering it next session.

## Lifecycle

1. **Capture** — one markdown file, status `discussing`. State the problem, the proposed shape, and which existing decisions it touches.
2. **Discuss** — add dated notes. Push back. Name failure modes. Do not implement from an idea.
3. **Mature** — status `ready`. Open questions are answered or explicitly deferred. The idea does not contradict an accepted decision without saying so.
4. **Promote** — copy the problem and the chosen shape into a new epic. Link back. Change status to `promoted`. Do not leave two sources of truth.

An idea that fails the argument is marked `shelved` with the reason. Shelved is a valid outcome.

## What does not belong here

- Bugs and small tasks — `work-items/`.
- Accepted architecture — `docs/`.
- “We should just build it” without a problem, a cost, and a way it can be wrong.

## Files

| File | Status | One line |
| --- | --- | --- |
| [site-skills.md](./site-skills.md) | discussing | Versioned site skills, shared and obsolete-able, to cut cold-start probing |
