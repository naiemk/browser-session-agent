# V2 — Campaign engine

Status: **target state, out of scope for current work.** This exists so today's agent-layer decisions do not foreclose it. Current work is `docs/autonomous-agent.md` and the plan behind it. Decisions live in `docs/decisions.md`.

## Shape

A campaign manages agents. The agent layer completes bounded tasks in a browser; the campaign layer decides which tasks exist, when they run, who they concern, and when a human is needed.

```
Campaign (calendar time, many entities, budgets, human queue)
    │  schedules
    ▼
Agent run (one bounded task, minutes)
    │  drives
    ▼
Browser (one profile, one identity, one screen)
```

## Why a campaign is not a long task

Real-world processes are not one connected piece of work. "Reach small email-service companies with a proposal" or "apply to suitable jobs" is a few hundred small identical pipelines advancing over days:

```
discovered → qualified → contacted → responded → engaged → closed | dropped
```

The unit of work is an **entity with state**, not a step in a dependency graph. Most entities are blocked on someone else most of the time.

Three properties follow, none of which a coding agent needs:

- **Waiting on people, not machines.** CI latency is predictable and retrying is free. A connection request may be accepted in two days or never, and retrying has a social cost. Coding's assumption that faster is better inverts here.
- **The world changes while you wait.** New candidates appear, invites expire, the site redesigns, the session logs out. Progress must be re-derived from reality, not assumed from our records.
- **Deliberate slowness is correct.** Platform pacing and human tolerance both bound throughput. Volume is a liability, not a goal.

## Campaign model

- **Entities** with stable identity and stage, each carrying an idempotency key so a resume never repeats a contact.
- **Park and wake** instead of blocking. A parked entity records why it stopped, what would unblock it, and whether that block is perishable. Wake sources: a timer, a third-party event observed on re-check, or human attention.
- **Reconciliation.** On wake, verify state against the site before acting. The user may have replied, invited, or applied manually since we last looked.
- **Three budgets per campaign, per time window:** model cost, site pace, and human attention. The scheduler respects all three. They are the same shape: a scarce resource per unit time.
- **Approach-level replanning.** "Search LinkedIn" failing should promote the alternative "search the web for companies first, then look them up", not a retry of the same step. This is strategy substitution, distinct from step-level recovery.

## Human collaboration is batched, not interruptive

The agent will get stuck. Coding has this too: "I cannot push, please run these commands." Two differences matter.

In coding a block is usually singular and on the critical path, and the hand-off stays valid for days. In a campaign, blocks are **many, independent, and off the critical path** — thirty-nine other applications remain workable while one hits a CAPTCHA — and many blocks are **perishable**.

So a block must never stop the campaign. It parks one entity and the scheduler continues. Requests accumulate into a queue and are presented in one sitting.

**The cost being optimized is the human's context switching**, so items batch by interaction kind. Ten CAPTCHAs in a row is fast; alternating CAPTCHA, decision, and approval is slow.

Three kinds, because they have different physics:

- **Durable decisions** — which of these three titles matches, approve this message, is this company in scope. Parkable indefinitely, answerable **without the browser**, batched into an inbox. Most items should end up here.
- **Perishable and session-bound** — CAPTCHA, OTP, an open modal. Cannot be held for hours; the challenge and often the page session go stale. Do not attempt to freeze a live modal. Park the *intent* and re-drive the task to the blocking point when the human is present.
- **Identity and credential** — login, 2FA, payment confirmation. Perishable, requires the live browser and the highest trust. Takeover already covers the mechanics.

A human session is therefore something the campaign **schedules and justifies**: "twelve items, roughly eight minutes, five are perishable so they need you at the browser." That is a feature, not a queue dump.

## Quality is the objective, not throughput

The objection to outreach automation is not that a machine typed the message. It is that high-volume, un-personalized contact wastes the recipient's time. A researched, specific, true message is legitimate regardless of who typed it. We are building a companion, not a bot.

That framing has to be operational or it is just a slogan:

- **Optimize the metric that makes spam self-defeating.** The campaign's success metric is response and acceptance rate, never messages sent. If reply rate falls below a floor, the campaign pauses and replans rather than pushing more volume.
- **Gate on evidence of personalization.** Before an outreach message is sent, require that we actually observed this person or company, and that the message references something specific and verifiable from that observation. A message that cannot cite what it is based on does not pass the gate.
- **Graduated trust on content.** The first messages are approved individually. Once the human's edits stop materially changing the drafts, approval batches. Voice is learned from those edits. This mirrors the candidate-to-approved discipline already used for knowledge (D8).

One honest limit: quality addresses the ethical problem, not the platform-policy one. Terms of service measure automation, not merit, and an account can be restricted for automated invites however good the messages are. Human approval at the commit point and human-like pacing are mitigations for that separate risk.

## Shared-resource constraint

The campaign manages many agent runs, but they contend for **one browser profile, one logged-in identity, one rate limit, and one screen for takeover**. Fan-out is bounded by that, not by compute. Tab ownership and exclusive locks already exist in the agent layer (`ownedTabIds`, `assertCanAct`) and are the right substrate; the campaign cannot simply spawn twenty workers.

## What this implies for the agent layer now

The campaign engine is not being built. These are the cheap choices that keep it reachable, and they are nearly impossible to retrofit:

1. **Park is a normal outcome, not an error.** A bounded task must be able to return `parked` with a reason, a wake condition, and a perishability flag. Today `awaiting_takeover` stops an entire run; it needs to become per-entity.
2. **Durable state is entity-oriented with idempotency keys**, not one run blob. Today's `RunState` is session-shaped.
3. **Cold resume.** Task state must be sufficient to resume with no session context, which confirms that session memory is a within-day optimization and never the source of truth.
4. **Design the agent to yield, not to finish.** This is the one-line summary: a campaign-ready agent is one whose normal outcomes include "stopped, here is exactly what I need," and which keeps nothing important only in a session.

## Out of scope for V2 as written

Scheduler implementation, notification channels, campaign UI, multi-profile or multi-identity fan-out, CRM integrations, and any autonomous sending without an approval path.

## Open questions

- How is a perishable block re-approached cheaply when the human arrives — replay from a checkpoint, or re-drive the task from its start?
- What reply-rate floor is meaningful, and over what window, before a campaign should pause itself?
- How is personalization evidence represented so the gate can check it mechanically rather than asking a model whether the message "feels" personal?
- Can durable decisions be answered entirely outside the browser session, so the inbox works on a phone?
- How does the campaign detect that the user acted manually, without re-scanning everything?
