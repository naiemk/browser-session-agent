# PRE-01: Hosted Pi Agent

Status: done

As the operator, when I send a goal in chat on the hosted site, Pi (not a stub) inspects and acts through the helper using the same tools as V1.

## Acceptance criteria

- With `BSA_NO_PI` unset, the API starts `createAgentSession` and advertises models from authenticated providers.
- Browser tools include `browser_inspect`, act verbs, `browser_run_plan`, and `browser_fill`.
- Cost routing stays Pi Router (D12); no second router.
- Production image/env omits `BSA_NO_PI`.
- If the helper is disconnected, browser tools fail closed; chat still answers.
- A connected helper plus a prompt results in browser tool use (not `I heard you:` stub text).

## Decisions

See `docs/pre-v1.md`, `docs/decisions.md` D12, D13, D16–D18. Automated CI may mock Pi; it must not require vendor keys.

## Tasks

- [PRE-01-T01](../tasks/pre-v1-01-t01-pi-wired.md)
- [PRE-01-T02](../tasks/pre-v1-01-t02-agent-tools.md)

## Tests

Pi wiring without `BSA_NO_PI`; scripted/fake Pi tool path with a helper connected. See `docs/test-design.md` (PRE-01).
