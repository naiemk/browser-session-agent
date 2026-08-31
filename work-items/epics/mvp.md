# Epic: MVP Browser Operations Loop

Status: in_progress (100% of planned tasks have implementations and passing tests; headed Pi operator path remains a manual check)

## Outcome

A CLI user can give Pi a browser goal, complete a human takeover when needed, and see the worker resume with evidence.

## Risks

- browser state must remain resumable
- page observations must be compact and useful
- tab ownership must prevent collisions

## Stories

- MVP-01: Pi CLI browser-operations extension
- MVP-02: persistent Chromium and Playwright worker
- MVP-03: semantic page observation and bounded actions
- MVP-04: evidence, verification, and durable run state
- MVP-05: interactive clarification and human takeover
- MVP-06: candidate knowledge and safe reuse

## Tasks

| Task | Story | Status |
| --- | --- | --- |
| [MVP-01-T01](../tasks/mvp-01-t01-pi-package-scaffold.md) | MVP-01 | done |
| [MVP-01-T02](../tasks/mvp-01-t02-tools-commands-recording.md) | MVP-01 | done |
| [MVP-02-T01](../tasks/mvp-02-t01-persistent-worker.md) | MVP-02 | done |
| [MVP-02-T02](../tasks/mvp-02-t02-tab-ownership-takeover.md) | MVP-02 | done |
| [MVP-03-T01](../tasks/mvp-03-t01-semantic-observation.md) | MVP-03 | done |
| [MVP-03-T02](../tasks/mvp-03-t02-bounded-actions-verification.md) | MVP-03 | done |
| [MVP-04-T01](../tasks/mvp-04-t01-evidence-recovery-resume.md) | MVP-04 | done |
| [MVP-05-T01](../tasks/mvp-05-t01-clarification-handoff.md) | MVP-05 | done |
| [MVP-06-T01](../tasks/mvp-06-t01-candidate-knowledge.md) | MVP-06 | done |

Progress is 9/9 tasks implemented with passing automated tests. Headed Pi login takeover is a manual operator check.

## Spec pointers

- `docs/mvp.md` — product boundary
- `docs/architecture.md` — runtime spec
- `docs/decisions.md` — research decisions
- `docs/test-design.md` — test map
