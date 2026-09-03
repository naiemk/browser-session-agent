# AGENT-02: Ask the page anything, change nothing

Status: todo

As the agent, when the semantic snapshot does not answer my question, I can query the live page directly and get JSON back, without acting on it — the browser equivalent of `grep`.

## Acceptance criteria

- `browser_probe` answers arbitrary read-only questions about the current page and returns JSON only.
- Page state is provably unchanged after a probe: same URL, same field values, no observation delta.
- Mutation cannot be expressed: navigation, click, fill, press, submit, and assignment-style evaluation are rejected with a clear error.
- Probe results cannot become an action locator; semantic refs remain the only way to act (D5).
- Cookies, `localStorage`, `sessionStorage`, `indexedDB`, and headers are inaccessible from a probe.
- Password values and token-shaped strings are redacted before entering model context and before being written to the ledger.
- Output is hard-capped and truncated with a continuation notice.
- Every probe appears in the evidence ledger.

## Decisions

D21 (reads open, mutation scripting excluded — amends D2), D22 (probe output is sensitive), D5, D18.

## Tasks

- [AGENT-02-T01](../tasks/agent-02-t01-probe-tool.md)
- [AGENT-02-T02](../tasks/agent-02-t02-probe-security.md)

## Tests

`tests/e2e/agent-02-probe.test.ts`, `tests/unit/agent-probe-policy.test.ts`.
