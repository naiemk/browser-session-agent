# Optimization

Delivering the job is priority one. This is not a standing token diet; it is the apparatus
that makes a cost question answerable when it comes up, and that explains a regression well
enough for someone to decide whether it was worth it.

Nothing here fails a build. A build that breaks on cost teaches everyone to raise the
budget, and a bare percentage is noise people learn to ignore. What is useful is a number
with a cause attached.

## Running it

```bash
npm run optimize:check       # mock suite, then a delta against the committed baseline
npm run optimize:baseline    # regenerate optimize/baseline.json after an accepted change
browser-agent metrics <goalId> [--root <dir>] [--json]
browser-agent compare optimize/baseline.json <report.json>
```

CI runs the check on every push and writes the delta to the job summary. The structural
numbers — bytes, duplicates, cache invalidation, key collisions — need no model and no
tokens, so they come free from the mock target. Token and cost numbers need a paid run:
trigger the **Live baseline** workflow.

## Reading the report

`metrics` prints four things, in the order they usually matter.

**Where the bytes went** is the headline. Knowing a run cost 40,000 tokens tells you
nothing you can act on; knowing that two thirds of it was tool schemas does. Fixed
overhead is counted once per turn because that is how often it is sent.

**Duplicate work** counts answers bought twice: identical tool results, reads that returned
a byte-identical page, repeat navigations, and repeated probe queries. The first two come
from content hashes, the last two from the ledger.

**Prompt cache** reports how many turns rewrote history and how early. Providers cache on
an exact prefix, so rewriting a message at index 2 discards the cache for everything after
it. A low index every turn means the context is being billed as fresh input.

**Key collisions** counts controls in a snapshot that share a role and name. It is here
because the page delta cannot tell those apart, so a high number means the delta — and
anything built on it — is unreliable on that page.

## Where the seam is

Every idea for describing a page more cheaply is an answer to the same question, so the
answer is a strategy rather than a rewrite: [src/runtime/view/index.ts](../src/runtime/view/index.ts).
`flatView` is what ships and the baseline everything is measured against. A candidate
implements `ViewStrategy`, runs the same suite, and either moves the numbers or does not.

It lives in the runtime and not in `src/optimize` on purpose. It is a production hot path,
and a hot path filed under "optimize" invites being treated as optional. `src/optimize`
holds measurement and comparison only; the emit-side port is
[src/runtime/metrics.ts](../src/runtime/metrics.ts), so no production code imports the
optimize directory. Measurement infrastructure — the suite — may.

## Trying a candidate

1. Implement `ViewStrategy` beside `flatView` and register it in `VIEW_STRATEGIES`.
2. Pass it to `RuntimeDriver` via `view`, run the mock suite, and write `--optimize-out`.
3. `browser-agent compare` the two summaries. Success rate must hold: a cheaper
   description that fails more tasks is not cheaper, it is worse.
4. Add a row below, then make it the default in a separate change.

## Log

Append, never rewrite.

| Date | Change | Effect | Notes |
| --- | --- | --- | --- |
| 2026-09-04 | Instrumentation, view seam, prune by payload shape, unique delta keys | Baseline established at 2,569 B of context per task across 29 mock tasks | First measurement. The two fixes below were made because they are defects, not because a number asked for them. |
| 2026-09-05 | Settle a failing verdict before believing it | No notable change against the baseline | Expected, and the reason it is worth logging. A pass still costs one read, so the structural numbers cannot move; what moves is on real pages, where a false failure used to buy a retry and retries are turns. The wait costs latency and no tokens, which on a run already 75% idle is the cheap side of the trade. |
| 2026-09-05 | Control lists as a table; ranked control budget; refs that survive; fewer instructed round trips; compaction at sub-goal boundaries | Tool result bytes per task 1,722 → 1,359 (-21.1%). Card 2,749 → 3,009 B, tool schemas 5,834 → 5,936 B, both resent per turn | A net loss **on this suite** and expected to be a clear win on real pages. See below. |
| 2026-09-05 | Perception seam; lean candidate (occlusion + containment) | Fixture suite: structural numbers unchanged. Corpus: a follower dialog at 99 controls, reference offered 80 and could not put follower37 on the wire; lean offered 48 and could, having dropped 51 buried under the backdrop. Nested cards: 90 contained listboxes dropped. | The mock suite cannot see this. The corpus can, and is now a suite task (`nav-shell-save`) plus a lean-gated one (`followers-under-dialog`). |
| 2026-09-05 | Lean is the default; fill read-back; sticky approval; compact at sub-goal in runTask; `save_artifact`; `fill-then-save` | 30→32 tasks. Card 3,009→3,115 B, schemas 5,936→6,372 B (14th tool). Context 2,538→2,603 B/task. `followers-under-dialog` joins the default mock set. | Product Chromium was still on reference (`WorkerBrowserPort` called `super()` with no args). CLI/suite `runTask` still pruned every turn; hosted Pi did not. Compaction is now a suite fact: `fill-then-save` is two operator messages, and the prefix is rewritten once. |

### Why the suite says one thing and the run will say another

The honest reading of the row above: on the mock suite these changes cost more than they
save. Fixture pages carry around five controls, so the table saves about 93 bytes per
snapshot, while the card and schemas grew by 362 bytes and are resent on every turn. At
roughly five turns a task that is 1,810 bytes added against 363 saved.

The crossover is about 24 controls per snapshot. Every page in the suite is far below it;
the pages in the metered run were at the 40-control cap, where the table saves closer to
760 bytes a snapshot. So the format is the one change here the suite can measure, and it
measures it on the pages least favourable to it.

Everything else on that row is invisible to this suite by construction:

- **Instructed round trips.** The card used to say refs go stale, so the agent observed
  before every action; refs now survive while their element does. A mock plan has a fixed
  number of steps, so a saved turn cannot show up. On the metered run a turn cost the card
  and every tool schema again, so removing twenty of 112 turns dwarfs 362 bytes a turn.
- **Compaction.** It fires at a sub-goal boundary. `fill-then-save` is the one suite
  task with a second operator message, so the average still looks like a single-goal
  run; the e2e asserts the rewrite happens once and then stops.
- **Ranked control budgets.** Nothing in the suite exceeds the cap, so nothing is ranked.

That is a gap in the apparatus, not a reason to distrust the changes: the suite measures
structure on small pages cheaply, and it was never going to measure turn count or a
multi-sub-goal conversation. The measurement that decides these is the next real run,
which is now instrumented for it — turns are joinable to payloads, and a compaction shows
up as a `rewrittenFrom` near the front on exactly one turn per sub-goal.

### The one that was rejected

Delta encoding - sending only what changed since the last snapshot - was estimated at the
smallest saving of the levers considered and is the only one that interacts badly with
compaction. A delta is meaningless without the snapshot it is a delta against, and
compaction exists to drop exactly those. Making the two safe together means the view has
to know where the compaction boundaries are, which couples the description of a page to
the management of the context. Not worth it for the smallest saving on the list.

### What the first measurement found

Two things, neither of which was the thing we expected to find.

**Fixed overhead dominates.** On the mock suite, tool schemas are around 64% of attributed
bytes and the task card around 30%, leaving page content under 6%. That is 5,834 bytes of
schemas for 13 tools plus a 2,763-byte card, resent on every turn — roughly 2,100 tokens
per turn before the model learns anything about the page. The prediction going in was that
stale action snapshots would dominate; on fixture pages they do not come close. Real pages
have snapshots ten times larger and will shift the ratio, which is the next thing to
measure rather than assume.

**The prompt cache is being invalidated almost every turn.** A metered traversal rewrote
history on 10 of 12 turns, with the earliest rewrite at index 2 on average. Pruning
replaces a superseded snapshot's content in place, which changes the prefix the provider
cached, so the saving in raw tokens is bought by re-billing the remainder at full price.
The mock target reports no cost, so the size of that trade is still unknown — it needs a
live run with the usage split, which is now recorded.

Both findings argue against the obvious next step. Compacting snapshots harder would chase
under 6% of the bytes, and pruning more aggressively might cost money rather than save it.
The cheap experiments are trimming the schemas, and pruning by dropping from the tail
rather than rewriting the middle.

## Deliberately not built yet

The aria-snapshot strategy, repetition collapse, diff-only reads, and extraction instead of
traversal. Each is a candidate behind the seam, to land with a before and after in the log
above.

The crowded-page gap is closed: `nav-shell-save` is a default suite task on a page past
the cap, and `followers-under-dialog` is the same idea under a modal, gated on the lean
perceiver. Still missing, and now the gap that matters most: a suite task with more than
one sub-goal. Without it the suite cannot measure compaction.

The additive perception candidates — listener detection, pointer-cursor heuristics, shadow
DOM, iframes, a CDP perceiver — stay off this list until a real page says we are missing
routes rather than wasting slots. `browser-agent perceive diff` is how that question gets
asked.
