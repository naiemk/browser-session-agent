# Delivery Methodology

This repository uses Markdown work items as a lightweight, versioned planning board.

## Hierarchy

- **MVP:** the smallest end-to-end product proof.
- **V1:** the next product stage after the MVP foundation.
- **Epic:** a measurable outcome composed of user stories.
- **User story:** a user-facing capability with acceptance criteria.
- **Task:** an implementable unit of work under one story.

## Locations

- docs/mvp.md and docs/v1.md: product boundaries.
- work-items/epics/: epic summaries, risks, story inventory, and progress.
- work-items/stories/: one Markdown file per story.
- work-items/tasks/: one Markdown file per task, created after story discussion.
  Each task states spec, what is possible, what we will do, tests, and done-when.

## Status and progress

Each item carries planned, in_progress, blocked, or done. Epic completion is calculated from completed child tasks; before tasks exist, it remains 0%.

## Operating rules

- Record decisions as Markdown and submit them through a pull request.
- Discuss and approve story intent before adding tasks.
- Keep acceptance criteria observable.
- Update evidence, risks, progress, and decisions as work changes.
- Preserve enough context for a future agent session to continue without rediscovering prior decisions.
