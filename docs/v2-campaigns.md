# V2 — Campaign product

Status: product semantics for the target durable-work architecture. The current
`src/jobs` prototype does not yet implement this product.

**Normative engine requirements:** [`docs/jobs-v2-spec.md`](jobs-v2-spec.md)
**Evaluation / cutover gates:** [`docs/jobs-v2-evaluation.md`](jobs-v2-evaluation.md)
**Product overview:** [`docs/long-running-jobs.md`](long-running-jobs.md)
**Tickets:** [`work-items/epics/v2-campaigns.md`](../work-items/epics/v2-campaigns.md)

A campaign is a long-running job with a recurring source and many independent cases. It
does not introduce another scheduler, agent hierarchy, persistence model, or approval
system.

```text
Job (objective, spec, aggregate outcome)
  |
  +-- source operation discovers stable case keys
  |
  +-- Case A -- work item -> bounded attempt -> browser
  +-- Case B -- parked on a human
  +-- Case C -- waiting on time
  |
  +-- shared profile/host/model/human budgets
```

## Why a campaign is not a long task

Real-world processes are not one connected piece of work. "Reach small email-service companies with a proposal" or "apply to suitable jobs" is a few hundred small identical pipelines advancing over days:

```
discovered → qualified → contacted → responded → engaged → closed | dropped
```

The schedulable unit is a **work item that advances one case**. The campaign is judged
from case outcomes and artifacts, not from the completion of one browser session.

Three properties follow, none of which a coding agent needs:

- **Waiting on people, not machines.** CI latency is predictable and retrying is free. A connection request may be accepted in two days or never, and retrying has a social cost. Coding's assumption that faster is better inverts here.
- **The world changes while you wait.** New candidates appear, invites expire, the site redesigns, the session logs out. Progress must be re-derived from reality, not assumed from our records.
- **Deliberate slowness is correct.** Platform pacing and human tolerance both bound throughput. Volume is a liability, not a goal.

## Campaign additions to the shared job model

- **Stable case identity.** Discovery emits task-defined keys. Repeating a source updates
  or ignores an existing case instead of duplicating it.
- **Approved per-case workflow.** Discovery instantiates a template graph for that case;
  it does not ask the model to invent weaker success criteria.
- **Park and wake.** A blocked case records a typed reason, checkpoint, wake condition,
  and evidence. Timer, observed external change, resource recovery, or human work may wake
  it according to policy.
- **Reconciliation.** Every wake checks current external state before attempting an effect.
  The user or third party may have acted while the case was parked.
- **Windowed budgets.** Model cost, browser/site pace, external effects, challenges, and
  human attention are scarce resources enforced by the shared scheduler.
- **Aggregate quality.** Typed job-level oracles evaluate accepted case outputs, coverage,
  evidence, and stop policy.
- **Approach substitution.** A failed route chooses another approved template or requests
  a spec revision. It is distinct from repeating a failed click.

## Human collaboration is batched, not interruptive

The agent will get stuck. Coding has this too: "I cannot push, please run these commands." Two differences matter.

In coding a block is usually singular and on the critical path, and the hand-off stays valid for days. In a campaign, blocks are **many, independent, and off the critical path** — thirty-nine other applications remain workable while one hits a CAPTCHA — and many blocks are **perishable**.

So a case-local block does not stop unrelated work. A host/profile challenge can
legitimately stop all work sharing that resource, while work on independent resources may
continue. Requests accumulate and are presented in one sitting.

**The cost being optimized is the human's context switching**, so items batch by interaction kind. Ten CAPTCHAs in a row is fast; alternating CAPTCHA, decision, and approval is slow.

Three kinds, because they have different physics:

- **Durable decisions** — which of these three titles matches, approve this message, is this company in scope. Parkable indefinitely, answerable **without the browser**, batched into an inbox. Most items should end up here.
- **Perishable and session-bound** — CAPTCHA, OTP, an open modal. Cannot be held for hours; the challenge and often the page session go stale. Do not attempt to freeze a live modal. Park the *intent* and re-drive the task to the blocking point when the human is present.
- **Identity and credential** — login, 2FA, payment confirmation. Perishable, requires the live browser and the highest trust. Takeover already covers the mechanics.

A human session is something the job **schedules and justifies**: "twelve items, roughly
eight minutes, five are perishable so they need you at the browser." Perishable work is
re-driven one item at a time; the system does not pretend a stale browser modal was saved.

## Quality is the objective, not throughput

The objection to outreach automation is not that a machine typed the message. It is that high-volume, un-personalized contact wastes the recipient's time. A researched, specific, true message is legitimate regardless of who typed it. We are building a companion, not a bot.

That framing has to be operational or it is just a slogan:

- **Optimize the metric that makes spam self-defeating.** The campaign's success metric is response and acceptance rate, never messages sent. If reply rate falls below a floor, the campaign pauses and replans rather than pushing more volume.
- **Gate on evidence of personalization.** Before an outreach message is sent, require that we actually observed this person or company, and that the message references something specific and verifiable from that observation. A message that cannot cite what it is based on does not pass the gate.
- **Graduated trust on content.** The first messages are approved individually. Once the human's edits stop materially changing the drafts, approval batches. Voice is learned from those edits. This mirrors the candidate-to-approved discipline already used for knowledge (D8).

One honest limit: quality addresses the ethical problem, not the platform-policy one. Terms of service measure automation, not merit, and an account can be restricted for automated invites however good the messages are. Human approval at the commit point and human-like pacing are mitigations for that separate risk.

## Shared-resource constraint

Many attempts contend for **one browser profile, one logged-in identity, one rate limit,
and one screen for takeover**. Fan-out is bounded by that, not by compute. The shared
`ResourceCoordinator` owns profile, host, account, challenge, and pacing state across all
jobs. A campaign cannot simply spawn twenty browser workers.

## Required shared-engine guarantees

1. **Blocked is a normal outcome.** It carries a typed reason, checkpoint, resource scope,
   wake condition, and evidence.
2. **Durable state is case-oriented.** A model transcript or browser run is never the
   source of workflow truth.
3. **Cold resume is real.** A new process reconnects to the persistent browser profile,
   compiles a fresh bounded context, and reconciles before effects.
4. **External effects are honest.** A local claim cannot prove a remote effect happened;
   uncertain effects enter reconciliation.
5. **The agent yields.** “Stopped; here is exactly what is needed” is a successful
   scheduler outcome, not a loop failure.
6. **No interruptive approval.** Scheduled workers persist an approval request and release
   resources rather than waiting inside a model call.

## Out of scope for the first production slice

- hosted campaign UI and notification channels;
- multi-profile or multi-identity fan-out;
- CRM-specific integrations or domain-specific stage names;
- autonomous CAPTCHA solving;
- autonomous external effects outside an approved effect envelope;
- high-volume operation as a product objective.

## Open questions to settle with evidence

- Which checkpoint fields make perishable rehydration cheaper without depending on stale
  refs or page structure?
- Which aggregate quality metrics are generic enough for the engine, and which belong in a
  task-specific oracle package?
- When may read-only cases share one direct/Fabric batch without increasing challenge
  incidence?
- Can durable decisions be answered entirely outside a browser session?
- What is the cheapest reconciliation strategy that reliably detects manual or third-party
  action?
