# Evaluation: AGENT-13-T03 challenge handoff / resume

Date: 2026-09-09
Implementer: Auto (Grok)
Spec IDs: interactive takeover; durable park; headed rehydration; skip ≠ complete
Evidence: L0/L1 unit fixtures; behavior gated by `BSA_CHALLENGE_BEHAVIOR=1` (default off)

## Discovery

- Interactive Magpie had `session.takeover` / `bringToFront` but tools did not halt on
  challenge pages. Durable dispatcher classified challenges (T02) without parking a human
  item or releasing a typed resume path.
- Checkpoints must not store DOM refs (`compileAttemptContext` already rejects `ref`).
- UI `answerHuman` already refused perishable resolve without `verifiedByOracle`.

## Changes

- `InteractiveChallengeGuard` wraps tool results: telemetry always; halt + takeover +
  `awaiting_takeover` only when the flag is on. Observe/peek may unhalt after a fresh
  non-challenge page.
- Magpie (`src/extension.ts`) and hosted web call existing takeover RPC; no new
  `BrowserPort` method.
- Durable dispatcher parks one perishable `challenge` HumanRequest, blocks the work item,
  returns `waiting_human`, and does not evaluate the operation oracle as success.
- `prepareHuman` → `rehydrating` + headed observe / takeover.
- `resumeChallenge` → fresh observe, `tryResume`, one later tick of the work item.
- `skipHuman` → `skipped`; work stays blocked.
- PERF-01: turn `provider`/`model` + `model_change` + rollup `byModel`.
- PERF-10: exact probe dups keyed by page URL + query; `repeatedRecipe` otherwise.

## Spec validation

| Requirement | Status |
| --- | --- |
| Interactive: stop actions, focus tab, `awaiting_takeover` | Pass when flag on |
| Report/ask still allowed so the operator can skip | Pass |
| Telemetry without behavior by default | Pass |
| Deferred: one perishable challenge item + checkpoint, no ref | Pass |
| Worker releases lease while waiting | Pass (second tick does not execute) |
| Unresolved + expired cooldown still ineligible (`nextWakeAt` omitted) | Pass |
| Prepare starts headed rehydration | Pass (observe + takeover) |
| Resume from fresh observation; one work-item retry | Pass |
| Resume while challenge remains keeps work blocked | Pass |
| Skip does not complete the blocked operation | Pass |
| UI resolve without oracle cannot complete | Pass (existing + T03) |
| Expired tab → typed recovery, no ref replay | Pass (`expired_tab`) |
| Park/resume timestamps and blocked duration | Pass (`challenge_handoff` metrics + audit) |
| PERF-01 unlabeled turns omit model (no `"unknown"`) | Pass |
| PERF-10 same query / different URL is recipe, not exact dup | Pass |

## Senior review

| Category | Initial | After | Notes |
| --- | --- | --- | --- |
| Correctness | 2 | 4 | Park/resume/skip split; skip ≠ done |
| Boundaries | 3 | 4 | Flag default off; no CAPTCHA solver |
| Concurrency | 3 | 3 | In-memory shared coordinator; SQLite human dedup |
| Safety | 4 | 4 | Checkpoint has no `ref` |
| Observability | 3 | 4 | Turn identity + recipe vs exact probe |
| Test realism | 3 | 4 | FakeKernel + headed observe double |
| Maintainability | 4 | 4 | |

Hard gates: met for gated behavior + instrumentation. Live challenge corpus and two
switched-model runs remain QUAL/PERF evidence, not this ticket.

## Residual

- Precision/recall on labeled live challenge pages (T01/T04).
- In-process `ResourceCoordinator` is not yet the durable persistence port across workers.
- Interactive `intentRetriesLeft` is not enforced as a tool-level act budget; durable
  redrive is the next dispatcher tick.
