# Epic: What it costs, and who finds out

Status: not started — recorded so the cheap-reads work does not foreclose it. COST-01 has
an entry condition that is already met.

## Outcome

The agent knows two things it currently cannot: what an action will cost it, and who will
learn that it happened. Both are properties of situations rather than of verbs, and neither
can be read off a page — they are learned by doing, which is what makes them worth storing.

Context: `docs/decisions.md` D43 and D44, and the open questions in
`docs/autonomous-agent.md`. The layer beneath this one is `work-items/epics/agent.md`.

## Why it is its own epic

The cheap-reads build gave the agent a side tab, so it can now read hundreds of pages
cheaply while signed in as the user. That makes exposure a live concern rather than a
theoretical one, and exposure is not modelled anywhere: `src/core/gate.ts` and
`src/core/reversibility.ts` judge how recoverable an action is and say nothing about who can
see it. Everything else here is the same shape — consequence rather than capability.

## Risks

- Asking per item. Observability is a property of a surface, not of each row; forty prompts
  would train the operator to approve without reading. One confirmation per surface per
  goal, batched with everything else needing attention (D32).
- Caching affordances. The tempting entry is "what can you do on this site", which the model
  either knows or can read from the page, and which goes stale. Store only what a survey
  cannot reveal.
- Treating a difference as proof. The stranger view tells you whether a page needed the
  session; A/B tests, geography, and consent walls change an anonymous view too (D41).
- Optimising the footprint metric instead of the outcome. The cost of being seen is borne by
  the user, and a metric that only counts task success will never show it.
- Building the endpoint rung because it is clever. It resembles scraping more than
  operating, and it breaks silently when the endpoint changes.

## Stories

- COST-01: Observability as a second axis on the gate
- COST-02: Memory of what a survey cannot reveal
- COST-03: The rungs below forking
- COST-04: Familiarity is a liability
- COST-05: Concurrency, if a pace budget exists

### COST-01: Observability as a second axis on the gate

Every permission model we inherit is built on read versus write, and in an authenticated
browser that is not the load-bearing distinction. The one that matters is who finds out, and
it is independent of reversibility: viewing a story writes nothing and cannot be unseen,
editing your own bio is a write nobody learns about, a DM is both. The current gate models
one axis and will therefore wave through exactly the action a person would hesitate over.

The instrument exists. `viewWithoutSession` in `src/core/perspective.ts` says whether a page
needed our session: if it renders for nobody, the read was anonymous and no one learned
anything; if it took our session, our identity rode along with the request. `peek` already
records `withSession` on every event for this reason, so the gate can be added without
re-plumbing.

The argument for interrupting at all is not abstract safety. An agent that views four
hundred profiles leaves a footprint that makes the *user* look like a bot — a cost they
carry, invisible to the agent, and completely uncaptured by whether the task succeeded.

### COST-02: Memory of what a survey cannot reveal

Not affordances. Three things worth keeping, all of them learned only by doing:

- Traversal costs, so a surface already known to be expensive is not rediscovered.
- URL schemes, the highest-value entry: discovered once, validated by a single verified
  peek, and cheap to revalidate.
- Consequences — a nav bar says Bulk Actions exists, not that it silently skips archived
  records on this app.

Facts already carry provenance through `remember`, so the shape is there. Instrument first:
if the same expensive surface is not actually re-encountered across tasks, this does not pay
and not building it is the correct outcome.

**A gap that already exists, found while deleting the legacy knowledge store.** `remember`
is goal-scoped, and a personal fact is not: an email address does not change per goal, so
the agent cannot currently remember one across tasks and will ask again. The old
`KnowledgeStore` covered this, and porting it was rejected because it carried an approval
workflow and lexical search that a handful of personal facts do not need — but the need it
served is real. The fix belongs here: a cross-goal scope for `remember`, in `GoalStore` and
`src/core/paths.ts`, alongside URL schemes and traversal costs. The store file itself stays
on disk unread, so nothing recorded is destroyed in the meantime.

### COST-03: The rungs below forking

The ladder this build starts — read the DOM free, fork the situation cheaply — has one rung
left before mutate-and-undo. A dependent dropdown's options usually arrive from an endpoint
the page itself calls, so watching the network and querying that endpoint enumerates them
without touching the UI. It is the closest thing the browser has to reading the source, and
it is the answer to the case `peek` cannot reach: options that only exist as a consequence
of changing the page.

Held back deliberately, for the reasons in Risks. It also needs the credential discipline
the probe already enforces (D22).

### COST-04: Familiarity is a liability

The model's knowledge of a well-known site is an asset and a hazard: it can invoke an
affordance that existed two years ago, or exists on a different tier, without checking the
screen. On an app it has never seen it cannot hallucinate from priors and is forced to look,
which may make it *more* reliable per action even though it is slower.

Worth measuring rather than assuming: a fixture that mimics a familiar product but differs
in one affordance, scored on whether the agent binds to the screen or to its priors. If the
effect is real, the response is the existing rule — bind claims to observed evidence
regardless of how familiar the surface looks.

### COST-05: Concurrency, if a pace budget exists

Parallel side tabs would make traversal faster and make the user look considerably more like
a robot. Entry condition is a site-pace budget, which is a campaign concept
(`docs/v2-campaigns.md`), after which two or three concurrent peeks under that budget are
reasonable. Not before, and one at a time already removes every round trip.

## Tasks

None written. Each story above is one or two tasks; they get written when the story's entry
condition is met, not before.

## Entry conditions

- **COST-01** as soon as the cheap-reads work lands, since `peek` is what creates the
  exposure.
- **COST-02** and **COST-04** when the suite says whether they matter: respectively whether
  traversal costs are re-paid across tasks, and whether familiar surfaces are handled worse
  than unfamiliar ones.
- **COST-03** and **COST-05** on evidence of need only.

## Definition of done

- No read of another party's surface happens under our session without the operator having
  confirmed that surface once for this goal, and confirmations arrive batched.
- Every memory entry is something a survey demonstrably could not have told us.
- Each of the five open questions this epic owns in `docs/autonomous-agent.md` is answered
  with a results-log row or explicitly deferred with an entry condition.

## Also recorded: the cost model we chose not to build

D44 bets that making the good route cheap beats teaching the agent to reason about cost, so
this build ships `peek` and a budget nudge and no cost model. The bet is falsifiable and
`roster-cheap-traversal` is the measurement: its budget fits the peeking route and not the
navigating one. If a live run shows the agent still navigating to each item and back with
`peek` available, the bet was wrong and measure-one-item-then-commit becomes justified.

## Spec pointers

- `docs/decisions.md` — D22 (read-only is not harmless), D23 (reversibility is per
  situation), D32 (help is queued and batched), D41 (primitives, not taxonomies), D43, D44
- `docs/runtime.md` — the side tab, the survey, and forks as built
- `docs/v2-campaigns.md` — where the pace budget comes from
