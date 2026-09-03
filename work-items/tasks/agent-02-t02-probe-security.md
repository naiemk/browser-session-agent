---
id: AGENT-02-T02
title: Probe output is sensitive by default
story: AGENT-02
epic: agent
status: todo
depends: AGENT-02-T01
---

# AGENT-02-T02 — Probe output is sensitive by default

## Spec

- [docs/decisions.md](../../docs/decisions.md) — D22: read-only is not harmless on an authenticated page
- [docs/autonomous-agent.md](../../docs/autonomous-agent.md) — probe as an exfiltration path

## Possible

- `src/worker/observe.ts` — the old password redaction is a behaviour to **port**, not import (D34)
- AGENT-00-T01 — new result wrapping
- AGENT-00-T02 — new ledger writes, which already redact on write

## Do

1. Deny access to `document.cookie`, `localStorage`, `sessionStorage`, `indexedDB`, and request or response headers from inside a probe.
2. Redact before the result enters model context: password field values, anything matching common token and key shapes, and `Authorization`-like strings.
3. Apply the same redaction to the evidence ledger, since traces outlive the session.
4. Hard-cap result bytes independently of the truncation notice, so a large DOM cannot be exfiltrated in slices without it being visible in the ledger.
5. Document the policy inline where the tool is defined so it is not lost.

## Tests

- `tests/unit/agent-probe-policy.test.ts` — each denied surface returns a policy error, not data; redaction rewrites token-shaped strings and password values; the redactor is applied to both the tool result and the ledger record.
- `tests/e2e/agent-02-probe.test.ts` extended: a fixture page setting a cookie and a `localStorage` token cannot have either read through probe.

## Done when

No probe path can return credentials, storage, or headers; token-shaped strings and password values are redacted in both model context and the ledger; and the tests above pass in the `npm test` glob.
