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
