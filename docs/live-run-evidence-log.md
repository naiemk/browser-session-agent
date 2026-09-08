# Live-run evidence log

Append only. Corrections get a new dated note; do not rewrite an earlier observation.
Use `docs/live-run-review-template.md` for the full review.

## 2026-09-08 — Minsk candidate collection and invitation site

Identity:

- Goal: `goal_mtrvevpq001`
- Task: collect 200 Minsk partygoer Instagram accounts with at least 200 followers,
  prepare personalized invitation drafts, and do not send.
- Host: local Pi browser chat.
- Duration: approximately 74 minutes.
- Models: 6 GPT-5.6 Sol planning turns, followed by 411 GLM-5.3 Flash execution
  turns. Session model switches are authoritative; aggregate metrics incorrectly label
  the entire run GPT.

Performance:

- 417 turns.
- 234 `act`, 150 `probe`, 4 `observe`, 0 `peek`.
- 221 successful and 12 failed recorded browser actions.
- 833,521 fresh input tokens.
- 102,681 output tokens.
- 24,724,686 cache-read tokens.
- 15,156 cache-write tokens.
- $0.534847 total recorded cost.
- 96.7% cache-read share of prompt tokens.
- Mean context 849,186.6 bytes.
- Peak/final context 1,606,784 bytes.
- Final context included approximately 905KB live content and 702KB placeholders.
- Fixed-byte attribution: tool schemas 55.7%, agent card 31.0%, `act` results 7.1%,
  `probe` results 5.6%.
- 62 of 236 measured observations had key collisions; maximum 20.
- Rollup reported 133 repeated probes, but this is not an exact-duplicate count because
  the current metric omits page URL from the key.

Outcome and quality:

- The agent reported blocked/partial after collecting 25 candidates, then later reported
  success for the website subtask.
- After operator review, one kid-focused candidate was removed.
- Canonical JSON and website ended with 24 candidates, versus the requested 200.
- The agent's own decision log estimated only 12–15 of the remaining 24 would pass a
  strict nightlife/partygoer filter.
- Candidate fit drifted toward Minsk connection plus weak lifestyle/music signals.
- Candidate JSON lacked per-claim evidence URLs, confidence, recency, and typed fit
  dimensions.
- `verified` was overloaded between platform badge status and research validation.
- The tracker and DM artifact remained at 25 while canonical JSON/site moved to 24.
- Date, venue, host account, and public domain remained placeholders.
- The local RSVP button changed its own label but persisted no response.

Positive evidence:

- Browser execution was active rather than mostly narrative: 388 direct browser calls
  over 417 turns.
- Recorded browser action failure rate was approximately 5.2%.
- No messages, follows, likes, payments, or destructive actions occurred.
- No CAPTCHA or platform block was reported.
- A coding child successfully built and regenerated the local static site.
- The agent accepted an operator correction and removed the challenged candidate.

Evidence added to tickets:

- QUAL-01: supports the need for an explicit target-population rubric.
- QUAL-02: supports typed records and per-claim provenance.
- QUAL-03: confirms top-level and subtask completion can diverge.
- QUAL-04: confirms mixed-version projections after correction.
- QUAL-05: supports calibrating personalization before bulk generation.
- QUAL-06: supports review independent of the generation context.
- PERF-01: confirms aggregate model attribution is wrong after model switches.
- PERF-02: confirms interactive chat is unbounded in production.
- PERF-03: shows repeated navigate/probe classification recipes.
- PERF-04: 150 probes make navigation/extraction fusion worth measuring.
- PERF-05: includes no-progress follower-dialog scroll failures.
- PERF-06: confirms placeholder structure grows materially in a long session.
- PERF-07: confirms fixed card/schema bytes dominate attributed bytes.
- PERF-08: cannot be decided until model-specific usage is measurable.
- PERF-09: confirms observation collisions are frequent enough to correlate with errors.
- PERF-10: confirms the current repeated-probe count conflates reuse with duplication.

Decision:

- No behavioral solution accepted.
- Preserve all proposed fixes as hypotheses.
- Collect two more live runs before the decision review.
- Instrumentation that does not alter behavior may proceed separately.

## 2026-09-08 — Berlin Raspberry Pi checkout verification

Identity:

- Goal: `goal_mtt17kx6001`
- Task: find five Raspberry Pi 5 8GB units from European sellers, verify quantity,
  Friday delivery, VAT, shipping, and a delivered total below €600 through checkout.
- Host: local Pi browser chat.
- Duration: approximately 108 minutes from the first request to the last browser result.
- Models: 4 Kimi K3 planning/transition turns, followed by 263 GLM-5.3 Flash turns.
  The aggregate metric incorrectly labels all 267 turns Kimi K3.
- This run is not behaviorally comparable with the Minsk collection run, but it is
  cross-task evidence about approvals, challenge handling, failures, and context growth.

Performance:

- 267 turns; 159 `act`, 66 `probe`, 16 `observe`, and 1 `peek` result.
- Of 159 `act` calls, 97 returned `ok:true`, 35 returned `ok:false`, 10 were refused
  before execution, and 17 returned tool errors. Only 61% returned success.
- 1,355,679 fresh input tokens, 78,987 output tokens, 10,080,000 cache-read tokens,
  and $0.314675 recorded cost.
- Mean context 636,178 bytes; peak/final context 1,342,035 bytes. The final context was
  757,700 live bytes and 580,764 placeholder bytes.
- Tool schemas and the agent card were 52.9% and 29.4% of attributed bytes.
- 79 of 153 observations had key collisions; maximum 38.
- The five actual approval prompts held their tool calls open for approximately 45m22s,
  about 42% of total wall time.

Approval evidence:

- All five prompts were unnecessary for the operator's stated boundary: submit a product
  search, decline cookies, apply a search filter, add to cart, and continue as guest.
  The request explicitly authorized cart and checkout verification and forbade placing
  the order.
- Generic `submits-form` classification caused four of the five asks. `outbound-name`
  misclassified “Apply the filter” as an outbound effect.
- The ledger contains 26 `approval` rows, but only five rows have `asked:true`; approval
  event count is not user-interruption count.
- After the operator said only payment was irreversible, no new prompt was shown.
  Existing sticky approval identity also silently covered later controls named
  `form Options[_nextpage]`; that identity is too broad because the same generic name is
  reused across checkout stages.

Challenge evidence:

- At least nine seller domains were blocked by Cloudflare, 403, or access-denied pages.
  The ledger contains 17 observations titled `Just a moment...` alone.
- A challenge navigation commonly returned `ok:true` because its URL postcondition passed.
  There was no typed challenge outcome, host breaker, session challenge budget, takeover,
  or parked continuation.
- Digi-Key was retried three times after its first challenge, including a final retry more
  than 80 minutes after the first blocked seller. The report correctly disclosed the
  blocked route, but the runtime did not stop the repeated work.

Outcome and quality:

- The final `report` status was `failed`, correctly reflecting that no option met the
  €600 hard constraint and no order was placed.
- Reichelt quantity, shipping, VAT, and total were verified to the payment/delivery step:
  five units, €1,056.45 delivered, and stated 1–2 day transit.
- The report is useful but overstates some evidence. Only Reichelt reached a live cart;
  BerryBase's “100+ Stück” remained listing evidence, and blocked distributors' supposed
  list-price range was not verified in this session.
- The final review page was not reached. The artifact clearly states that limitation but
  still describes the surveyed sources too broadly as verified.

Evidence added to tickets:

- QUAL-02: supports evidence-level and source-URL fields so listing, cart, and checkout
  claims cannot be conflated.
- QUAL-03: supports the `failed`/partial top-level oracle and explicit unmet criteria.
- PERF-01: independently confirms incorrect aggregate model attribution.
- PERF-02 and PERF-06: context reached 1.34MB in 267 turns and remained unbounded.
- PERF-07: fixed card/schema text was 82.3% of attributed bytes.
- PERF-09: 51.6% of observations had collisions, while 39% of `act` calls did not return
  success.
- PERF-11: establishes a baseline for approval precision and prompt wait.
- PERF-12: establishes a baseline for typed challenges and circuit breaking.
- PERF-13: establishes a baseline for failed-action and no-progress budgeting.

Decision:

- Treat effect-aware approval and typed challenge termination as priority experiments;
  they have direct wall-time and safety evidence.
- Do not count this as one of the two comparable result-quality baselines.
- Do not implement CAPTCHA solving or anti-bot evasion. Test detection, bounded retries,
  takeover/parking, persistent-profile continuity, and pacing instead.

## Next live run — pending

- Goal id:
- Date:
- Task class:
- Commit:
- Models:
- Comparable with baseline: yes / no
- Review location:
- Main evidence:
- Ticket implications:
- Decision:

## Following live run — pending

- Goal id:
- Date:
- Task class:
- Commit:
- Models:
- Comparable with baseline: yes / no
- Review location:
- Main evidence:
- Ticket implications:
- Decision:
