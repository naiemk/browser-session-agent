# AGENT-10: Honest loop after a live run

Status: done

As the operator, when the agent peeks, navigates, probes, and reports, the harness
tells the truth: a bad expectation is dropped, a URL that did not land is a miss, a
JSON payload is not a page, and a report yields the chat instead of looping.

## Acceptance criteria

- Peek `expect` is validated as a predicate; malformed expect is dropped, never evaluated as `url includes "undefined"`.
- Peek `matched` is URL landing via shared `urlMatchesIntent`, independent of identity checks.
- `/reel/X` and `/reels/X` match; `/p/X` and `/reels/X` do not. Trailing slash and percent-encoding are normalized.
- Navigating to a non-HTML document fails, restores the previous URL, and says this is not a page. Not a denylist of `/api/` paths.
- Probe on a data document returns a short note (content type, byte length), not the body.
- Stuttered accessible names collapse (`SearchSearch` → `Search`; `Messages1Messages` → `Messages 1`).
- Nameless `a[href]` controls are named from the last path segment. Refs stay refs (D5).
- Observation may carry optional `identity: { heading, stats[] }` on the wire.
- Hosted `report` aborts the current prompt (yield, do not kill the session) and closes an open side tab.
- The same 14 tools; shorter schemas; peek `expect` is typed; `toolSchemaBytes` drops below 6372.
- A consume-only, capped site skill can be pasted or loaded as a fact; it never skips the commit gate.

## Decisions

D5 (refs, not selectors), D6 (one agent / one tool set), D17 (harness accepts), D23 (reversibility per action), D25 (memory proposes, never authorizes), D29 (turn cost), D54 (no mid-goal perceiver switch), D55 (hosts spawn a harness).

## Tasks

- [AGENT-10-T01](../tasks/agent-10-t01-peek-expect.md)
- [AGENT-10-T02](../tasks/agent-10-t02-url-intent.md)
- [AGENT-10-T03](../tasks/agent-10-t03-document-navigate.md)
- [AGENT-10-T04](../tasks/agent-10-t04-probe-data-document.md)
- [AGENT-10-T05](../tasks/agent-10-t05-stuttered-names.md)
- [AGENT-10-T06](../tasks/agent-10-t06-nameless-links.md)
- [AGENT-10-T07](../tasks/agent-10-t07-page-identity.md)
- [AGENT-10-T08](../tasks/agent-10-t08-report-yields.md)
- [AGENT-10-T09](../tasks/agent-10-t09-schema-trim.md)
- [AGENT-10-T10](../tasks/agent-10-t10-site-skill.md)

## Tests

Named on each task. After T07 and T09, `npm run suite:reference`.
