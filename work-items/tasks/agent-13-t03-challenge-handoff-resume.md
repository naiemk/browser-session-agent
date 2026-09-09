---
id: AGENT-13-T03
title: Hand off and resume challenged operations
story: AGENT-13
epic: agent
status: done
depends: AGENT-13-T02
---

# AGENT-13-T03 — Hand off and resume challenged operations

## Discovery

1. Trace current takeover, attention, park, human-inbox, and job re-drive paths.
2. Define the smallest durable operation checkpoint that does not retain a stale ref.
3. Test user-present, user-absent, expired-session, skipped-host, and repeated-challenge
   cases.
4. Identify duplicate-effect risks when resuming after a partially completed operation.

## Fix

1. Interactive runs focus the owned tab, set `awaiting_takeover`, and stop all actions.
2. Deferred runs park one `challenge` item with intent, page identity, checkpoint, and
   evidence IDs.
3. A deferred worker commits the block and releases model/browser resources; it never
   waits inside a UI callback.
4. Unresolved human-only work remains ineligible even after cooldown or checkpoint expiry.
5. Preparing a perishable item starts one headed rehydration attempt.
6. Resume takes a fresh observation, reruns challenge detection, and re-drives only the
   parked intent once.
7. A skip resolves the request without treating the blocked operation as completed.
8. Expired browser state yields a typed recovery request rather than replaying old refs.
9. A UI “resolved” response cannot complete the work without fresh oracle evidence.

## Evidence

- Takeover → solve/skip → resume fixture trace.
- Park → later tick → fresh observation → one intent retry trace.
- No duplicate external effect or extra human item.
- Correct status when the challenge remains, the tab disappeared, or the user skips.
- Prompt and blocked duration metrics.
- Fake-clock proof that unresolved challenge work never wakes autonomously.
- Scheduled-worker proof that no model/browser lease is held during human wait.

## Discussion

- When should a resumed challenge be retried automatically versus wait for confirmation?
- How long should deferred challenge items remain actionable?
- What minimum context should the human handoff show?
- Which parts belong to the generic attempt contract versus the CAMPAIGN-03-T02 durable
  adapter?

## Done when

Interactive and deferred paths resume from fresh evidence, preserve top-level status, and
prove one-attempt re-drive without duplicate effects.
