---
id: AGENT-14-T02
title: Add intent-bound effect envelopes
story: AGENT-14
epic: agent
status: done
depends: AGENT-14-T01
---

# AGENT-14-T02 — Add intent-bound effect envelopes

## Discovery

1. Trace current spec grants, interactive user intent, sticky approval keys, expiry, and
   nondelegable actions.
2. Define a generic effect vocabulary and limits without page/domain concepts.
3. Determine which explicit phrases safely authorize an envelope and which need one
   confirmation.
4. Reproduce checkout controls whose accessible names repeat across stages.
5. Threat-model destination changes, amount changes, stale pages, and generic final-submit
   controls.

## Fix

1. Store an immutable goal/spec-bound effect envelope with allowed effects, denied effects,
   scope, limits, expiry, and evidence.
2. Match actions using expected effect plus destination/form action and workflow/page
   identity.
3. Bind remembered approvals to the same fields and a bounded use count.
4. Invalidate on destination, effect, amount/audience/entity limit, goal/spec, or stage
   change.
5. Keep CAPTCHA, credentials, identity verification, and final financial commits
   nondelegable through an enforced gate decision; listing them in spec bytes is not
   sufficient.
6. Show one plain-language boundary confirmation only when explicit intent is insufficient.
7. Return `blocked.approval` when an asynchronous execution host lacks a matching grant;
   do not hold a scheduled model call open.
8. Define stable effect identity and a transactional grant-consumption contract for the
   CAMPAIGN-03-T02 durable adapter.

## Evidence

- “Add to cart and verify checkout; do not order” permits only the intended intermediate
  fixture effects.
- A generic repeated control name cannot reuse approval at the final-order stage.
- Destination/amount/stage mutation canaries fail closed.
- Every `neverPreapprove` category has an end-to-end job-gate canary.
- Job and interactive paths produce the same audit record.
- Live checkout comparison records fewer prompts with no consequential action.
- Duplicate durable retries create one approval request and consume one bounded grant only
  at effect dispatch.

## Discussion

- Which envelope fields are mandatory for every effect type?
- How should user corrections narrow or expand an active envelope?
- Which low-impact effects may be defaults versus request-scoped only?
- Keep envelope matching host-neutral here; effect journaling and persistence live in the
  durable-work epic.

## Done when

Intent produces an auditable bounded envelope, mutation canaries fail closed, and no
remembered approval aliases a different effect or workflow stage.
