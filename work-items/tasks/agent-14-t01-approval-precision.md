---
id: AGENT-14-T01
title: Measure and correct approval classification
story: AGENT-14
epic: agent
status: todo
---

# AGENT-14-T01 — Measure and correct approval classification

## Discovery

1. Reconstruct every Berlin-run ask from tool-call start through user response and action
   completion.
2. Label asks necessary, unnecessary, or ambiguous against the exact user request.
3. Audit recoverability and authorization rules independently.
4. Build fixtures for search forms, filters, cookies, cart edits, checkout navigation,
   data disclosure, send/publish, deletion, payment, and final order.
5. Test generic/repeated control names and GET/POST form actions.
6. Audit `neverPreapprove` from approved spec through `forbiddenByEnvelope`; today
   `credential`, `otp`, and `captcha` are required in the spec but have no independent
   gate enforcement.

## Fix

1. Record prompt-created, prompt-resolved, and action-finished timestamps.
2. Emit expected effect, destination/form action, rule IDs, and whether a grant matched.
3. Remove `submits-form` as sufficient evidence of outbound authorization.
4. Remove generic “apply” matching and use effect-specific positive rules.
5. Keep unknown recoverability conservative without turning unknown into a human ask.
6. Put corrected behavior behind a comparison flag until fixture and live evidence pass.
7. Replace the false list-presence guarantee with typed, testable nondelegable decisions;
   coordinate CAPTCHA classification with AGENT-13 and fail closed when a protected
   effect cannot be identified safely.

## Evidence

- Ask precision/recall confusion matrix.
- Zero asks for search, filter, cookie decline, and cart fixture cases.
- All send, publish, delete, payment, and final-order canaries ask or deny.
- Credential input, OTP, CAPTCHA interaction, payment, and destructive canaries cannot be
  preapproved by a job grant; the test reaches the real job/runtime gate.
- Prompt count and wait-time reduction on the checkout fixture and one live comparison.
- Existing before/after evidence and preconditions remain intact.

## Discussion

- Which server-visible but low-impact effects need audit evidence without approval?
- Where does data disclosure become consequential?
- Should conservative uncertainty park an action or request one focused clarification?

## Done when

The fixture set reaches at least 90% ask precision with zero missed consequential effects,
and explicit timing proves the wall-time impact.
