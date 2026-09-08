# Live-run quality and performance investigation

This is the durable backlog for issues found in real browser-agent runs. It preserves
candidate solutions without treating them as accepted designs.

The immediate goal is evidence, not implementation. Run at least two more comparable
live tasks before accepting a behavioral change. Instrumentation-only changes may land
earlier when they do not change the agent's prompt, tools, model selection, or browser
behavior.

Related documents:

- `docs/live-run-review-template.md` — fill this in for every new run.
- `docs/live-run-evidence-log.md` — append-only observations and decisions.
- `docs/autonomous-agent.md` — broader agent design and results log.
- `docs/decisions.md` — accepted decisions only.
- `docs/fabric-execution-experiment.md` — isolated PERF-03 execution-kernel R&D spec.
- `docs/challenge-and-approval-handling.md` — CAPTCHA/challenge and approval-boundary
  experiment design.
- `docs/jobs-v2-spec.md` — normative Jobs V2 requirements (implementation authority).
- `docs/jobs-v2-evaluation.md` — evidence levels and per-task review protocol.
- `docs/long-running-jobs.md` — product/architecture overview; defers to the normative
  spec.

## Current baseline

Run `goal_mtrvevpq001`, 7–8 September 2026:

- 417 model turns over roughly 74 minutes.
- 6 GPT-5.6 Sol planning turns and 411 GLM-5.3 Flash execution turns.
- 234 `act`, 150 `probe`, 4 `observe`, 0 `peek`.
- 221 successful browser actions and 12 failed actions.
- 833,521 fresh input tokens, 102,681 output tokens, 24,724,686 cache-read
  tokens, and $0.534847 recorded cost.
- Mean context 849,187 bytes; final and peak context 1,606,784 bytes.
- 24 final invite pages from a requested 200 candidates.
- The agent's own stricter review estimated only 12–15 of the 24 were strong
  nightlife/partygoer matches.
- Canonical JSON/site had 24 candidates after correction, while the tracker and DM
  artifact still described 25.

The aggregate metrics incorrectly label the entire session GPT-5.6 Sol. The Pi session
transcript proves the split above. This is PERF-01.

Run `goal_mtt17kx6001`, 8 September 2026:

- 267 turns over roughly 108 minutes: 4 Kimi K3 planning/transition turns and 263
  GLM-5.3 Flash execution turns.
- 159 `act`, 66 `probe`, 16 `observe`, and 1 `peek`; only 97 `act` calls returned
  `ok:true`. The remaining 62 were failed, refused, or tool errors.
- 1,355,679 fresh input tokens, 78,987 output tokens, 10,080,000 cache-read tokens,
  and $0.314675 recorded cost.
- Mean context 636,178 bytes; peak/final context 1,342,035 bytes, including 580,764
  placeholder bytes.
- Five false-positive approval prompts held tool calls open for about 45m22s.
- At least nine seller domains showed Cloudflare, 403, or access-denied challenges;
  challenge navigations commonly returned `ok:true` when the URL postcondition passed.
- 79 of 153 observations had key collisions, with a maximum of 38.
- The final result correctly reported failure of the hard €600 budget and preserved a
  useful partial checkout report, but overstated listing-level stock evidence as verified.

This run is cross-task evidence rather than a comparable result-quality baseline. It makes
approval precision, challenge termination, and action-loop health measurable without
settling their final implementations.

## Durable-work interpretation

The current `src/jobs` prototype is not a valid vehicle for these optimization
experiments: its due tick has no execution runtime, its CLI run uses an ephemeral browser,
and its tests do not cross a real process/profile boundary. Performance and quality
instrumentation should first attach to the common bounded-attempt contract.

For later jobs/campaigns:

- attribute model, browser, queue, pacing, challenge, human-wait, and unavailable-runtime
  time per attempt;
- normalize cost by accepted case output as well as completed work item;
- share host/profile breakers and pacing across jobs;
- compile a fresh bounded context from durable facts instead of carrying transcript or
  sprint history;
- evaluate top-level completion from durable accepted artifacts;
- keep direct and Fabric execution comparable behind one kernel interface.

Implementation work is tracked in `work-items/epics/v2-campaigns.md`; it does not change
the rule below that the next two live runs should remain behaviorally comparable.

## Jobs V2 mapping (does not close evidence tickets)

Jobs V2 supplies engine boundaries for some QUAL/PERF hypotheses. Mapping a ticket here
does **not** mark it accepted or complete. Live-run evidence and the decision review at
the end of this document remain required before behavioral claims.

| ID | Disposition | Jobs V2 home |
| --- | --- | --- |
| QUAL-01 | Remain open — task-specific rubric experiments | Outside cutover; engine supplies oracle plugin boundary only (QUALITY-04) |
| QUAL-02 | Integrated (infra) | QUALITY-01 → CAMPAIGN-03-T05 |
| QUAL-03 | Integrated (infra) | QUALITY-03 / EXEC-09 → CAMPAIGN-03-T05 |
| QUAL-04 | Integrated (infra) | QUALITY-02 → CAMPAIGN-03-T05 |
| QUAL-05 | Remain open — personalization experiments | Outside cutover |
| QUAL-06 | Integrated (generic review op only) | QUALITY-04 → CAMPAIGN-03-T05; domain rubrics stay task-specific |
| PERF-01 | Integrated | OBS-01 → CAMPAIGN-04-T02 |
| PERF-02 | Integrated | EXEC-04 / SCHED budgets → CAMPAIGN-02-T03 |
| PERF-03 | Remain open — Fabric R&D | OBS-06 / AGENT-12-T02; not a cutover gate |
| PERF-04 | Remain open — browser-runtime backlog | OBS-05; telemetry links only |
| PERF-05 | Remain open — browser-runtime backlog | OBS-05 |
| PERF-06 | Integrated | EXEC-04 context compiler → CAMPAIGN-02-T03 |
| PERF-07 | Integrated | OBS-04 → CAMPAIGN-04-T02 |
| PERF-08 | Integrated (after PERF-01 evidence) | OBS-04 routing hooks → CAMPAIGN-04-T02 |
| PERF-09 | Remain open — perception backlog | OBS-05 |
| PERF-10 | Integrated | OBS-04 metrics fix → CAMPAIGN-04-T02 |
| PERF-11 | Integrated via AGENT-14 + Jobs V2 | EFFECT-* / HUMAN-* → CAMPAIGN-03-T02/T04 |
| PERF-12 | Integrated via AGENT-13 + Jobs V2 | HUMAN-01..03 → CAMPAIGN-03-T03 |
| PERF-13 | Integrated via AGENT-15 + Jobs V2 | EXEC-07 → CAMPAIGN-02-T03 / CAMPAIGN-03-T03 |

Hard rule: cost does not fail CI by itself. Safety and correctness gates are hard;
optimization changes require before/after quality-normalized evidence
(`docs/optimization.md`, `docs/jobs-v2-evaluation.md`).

## Experiment rules

1. Keep the next two runs behaviorally comparable. Do not combine several proposed
   fixes before the baseline is understood.
2. Record the exact commit, host, selected models, model-change timestamps, task text,
   operator clarifications, and artifact paths.
3. Separate mechanical success from result quality. A browser action passing does not
   make a candidate relevant.
4. Never use the model's own statement of completion as the only oracle.
5. Score a blinded sample of results manually. Record why each item is accepted or
   rejected.
6. Normalize performance by useful output: per inspected entity, accepted entity, and
   completed top-level requirement.
7. Preserve failures and rejected hypotheses. Do not rewrite earlier run notes.
8. After two additional runs, hold the decision review described at the end of this
   document before implementing behavioral changes.

## Quality tickets

### QUAL-01 — Define and measure result relevance

Status: evidence gathering. Jobs V2: remain open (outside cutover).

Problem:

The agent changed “partygoer” into a medium-strength rule: Minsk connection plus a weak
lifestyle, music, concert, or nightlife signal. That admitted kid-focused, books,
barbershop, fishing, and generic lifestyle accounts. The interpretation was not confirmed
with the operator and was not represented as a measurable rubric.

Discovery:

- Capture the requested noun or referent exactly as written.
- Record every plausible interpretation the agent considered.
- Have the operator label a random sample as strong fit, weak fit, wrong audience, or
  insufficient evidence.
- Compare acceptance by source type, follower band, and evidence type.
- Measure inter-reviewer disagreement if a second reviewer is available.

Fix hypotheses:

- Ask one focused question when the target population has materially different meanings.
- Require a task-specific relevance rubric before collection.
- Score multiple independent dimensions instead of one Boolean qualification.
- Keep distinct populations separate, such as partygoers, promoters, performers, and
  cross-promotion partners.

Evidence required:

- Human precision among the top 10, top 25, and full delivered set.
- Rejection reason distribution.
- Number and cost of clarification questions.
- Yield under strict and permissive interpretations.

Discussion and decision:

- Which ambiguities justify interrupting the operator?
- What minimum human precision is acceptable? Initial decision threshold: do not call a
  list “qualified” below 80% human acceptance.
- Can the rubric be derived from examples without adding domain-specific product logic?

### QUAL-02 — Use typed result records with provenance

Status: evidence gathering. Jobs V2: engine infra in QUALITY-01 / CAMPAIGN-03-T05
(does not close this ticket).

Problem:

The final candidate JSON contains follower counts as strings and a short hook, but no
source URL, observed content URL, observation timestamp, recency, confidence, audience-fit
score, or evidence for each qualification claim. “Verified” also means Instagram's badge
in one file and research validation in prose.

Discovery:

- Inventory every field needed to audit acceptance or rejection after the run.
- Determine which fields are directly observed, inferred, or supplied by the operator.
- Measure how often a reviewer must reopen the browser because evidence is missing.
- Identify overloaded words such as `verified`.

Fix hypotheses:

- Introduce a generic typed collection record with stable entity id, normalized values,
  evidence references, observed-at time, confidence, and decision reason.
- Separate platform verification from agent verification.
- Require every inferred claim to point to at least one observation.
- Store numeric values canonically and render human formatting only in projections.

Evidence required:

- Percentage of delivered claims with inspectable evidence.
- Reviewer time per candidate.
- Number of browser rechecks needed during quality control.
- Parse and schema failure counts.

Discussion and decision:

- Which fields are universal, and which belong in task-defined result schemas?
- How much evidence can be retained without collecting unnecessary personal information?

### QUAL-03 — Add an external top-level completion oracle

Status: evidence gathering. Jobs V2: engine infra in QUALITY-03 / CAMPAIGN-03-T05
(does not close this ticket).

Problem:

The requested result was 200 qualified accounts. A later report returned `success`
because the website subtask completed even though only 25 candidates existed and the
report itself marked the 200-person step partial. Subtask success replaced goal success.

Discovery:

- Record every report status and the unmet criteria at that moment.
- Trace which component decides the visible final status.
- Test whether a late follow-up can overwrite an earlier blocked/partial state.
- Identify criteria that can be evaluated from artifacts without a model.

Fix hypotheses:

- Give the top-level goal immutable, externally evaluated completion criteria.
- Make report status subordinate to the oracle.
- Represent `partial`, `blocked`, and `subtask_complete` separately.
- Require cardinality, schema, evidence, and quality thresholds before top-level success.

Evidence required:

- False-success and false-failure rate across live runs.
- Number of status disagreements between report text and artifact checks.
- Whether deterministic checks can explain failures clearly to the agent.

Discussion and decision:

- Which criteria are operator-authored versus system-generated?
- Should a useful partial artifact be delivered while the goal remains incomplete? The
  expected answer is yes, but it must not become top-level success.

### QUAL-04 — Make generated artifacts consistent and reproducible

Status: evidence gathering. Jobs V2: engine infra in QUALITY-02 / CAMPAIGN-03-T05
(does not close this ticket).

Problem:

After one candidate was removed, the canonical JSON and website contained 24 entries,
while the candidate tracker and DM artifact still contained 25. The successful website
report also remained stale.

Discovery:

- Identify every canonical input and generated projection.
- Record generation ids or source hashes across JSON, Markdown, HTML, zip, and reports.
- Test add, remove, rename, and reclassify operations.
- Determine which artifacts are hand-maintained and which are generated.

Fix hypotheses:

- Use one canonical result ledger.
- Generate all projections in one transaction or build.
- Stamp every projection with source version/hash and candidate count.
- Refuse publication of a mixed-version artifact set.

Evidence required:

- Cross-artifact count, id, and hash consistency.
- Stale projection rate after corrections.
- Rebuild time and failure behavior.

Discussion and decision:

- Should reports be immutable historical facts or regenerated current views?
- Which files are products and which are debugging evidence?

### QUAL-05 — Evaluate personalization quality before generation at scale

Status: evidence gathering. Jobs V2: remain open (outside cutover).

Problem:

Messages and invite pages converted weak candidate hooks directly into prose. Some copy
was generic, awkward, or highlighted a mismatch rather than a reason to attend.

Discovery:

- Blindly score a sample for factual grounding, relevance, tone, specificity, and
  likelihood of a positive response.
- Check every personalized phrase against its cited evidence.
- Separate template quality from candidate-selection quality.
- Record corrections the operator makes.

Fix hypotheses:

- Require a source-backed personalization fact and a fit explanation.
- Generate drafts only after candidate qualification passes.
- Use a small calibration batch before producing all drafts.
- Add a second-pass critic that cannot change the qualification rubric.

Evidence required:

- Human acceptance and edit rate.
- Unsupported-claim rate.
- Duplicate or near-duplicate message rate.
- Time and cost wasted drafting for later-rejected candidates.

Discussion and decision:

- Is a second model pass worth its cost, or does a better candidate schema solve most
  failures?
- What level of personalization is useful without becoming invasive?

### QUAL-06 — Separate generation from independent review

Status: evidence gathering. Jobs V2: generic review operation in QUALITY-04 /
CAMPAIGN-03-T05; domain rubrics remain task-specific (does not close this ticket).

Problem:

The same model discovered candidates, interpreted ambiguous criteria, graded evidence,
generated messages, and declared completion. Its early assumptions propagated through
every downstream artifact.

Discovery:

- Compare self-review against a fresh-context review of the same records.
- Measure whether a second reviewer finds new errors or merely restates the first.
- Categorize disagreements by missing evidence, rubric ambiguity, and reasoning error.

Fix hypotheses:

- Run deterministic schema/oracle checks first.
- Review only uncertain or high-impact records with a fresh context.
- Optionally use a different model for blinded quality review.
- Route disagreements to the operator only when they change the delivered population.

Evidence required:

- Incremental defects found per review dollar and minute.
- Reviewer agreement.
- Precision improvement after review.

Discussion and decision:

- Review all records, a sample, or only low-confidence records?
- Same model with fresh context versus a distinct model?

## Performance and cost tickets

### PERF-01 — Record the actual model on every turn

Status: instrumentation blocker. Jobs V2: OBS-01 / CAMPAIGN-04-T02 (does not close).

Problem:

`metrics.jsonl` records the first metered model once in the `run` row. Turn records contain
usage and thinking level but no provider/model. A session that switched from GPT planning
to GLM execution was reported entirely as GPT.

Discovery:

- Compare metric rows with Pi `model_change` entries and assistant message metadata.
- Check local Pi, hosted Pi, bounded runtime, and child agents.
- Confirm whether provider-reported cost remains correct after a switch.

Fix hypotheses:

- Add provider/model to every turn record.
- Emit explicit model-change metric events.
- Roll up turns, tokens, and cost by model and execution phase.

Evidence required:

- Exact agreement with session transcripts in two switched-model runs.
- Cost totals unchanged after attribution.
- Backward-compatible rollup for older metric files.

Discussion and decision:

- Turn-level model fields are the simplest candidate. Decide whether model-change events
  add useful information beyond them.

### PERF-02 — Bound long interactive chat execution

Status: evidence gathering. Jobs V2: EXEC-04 / CAMPAIGN-02-T03 (does not close).

Problem:

The production chat recorded `maxTurns: 0` and ran 417 turns. The bounded task runtime has
a model-port cap, but interactive Pi chat does not use it.

Discovery:

- Measure useful-result accumulation by turn.
- Identify points where a compact handoff could have occurred without losing browser
  state or operator intent.
- Record quality before and after long-context thresholds.
- Compare one long session with bounded resumable slices.

Fix hypotheses:

- Add finite per-request turn and action budgets.
- Yield with a structured checkpoint and continue in a fresh bounded worker.
- Distinguish a user-visible pause from a task failure.

Evidence required:

- Completion and quality at equal total work.
- Turns, latency, fresh tokens, cache-read tokens, and cost per accepted result.
- Information lost or rediscovered after each handoff.

Discussion and decision:

- Choose the slice boundary from evidence, not an arbitrary small cap.
- Should the host continue automatically, schedule a job tick, or ask the operator?

### PERF-03 — Execute repeated read-only collection recipes locally

Status: evidence gathering. Jobs V2: remain open Fabric R&D (OBS-06 / AGENT-12-T02);
not a cutover gate.

R&D task: `work-items/tasks/agent-12-t02-fabric-execution-rd.md`. The task tests Pi
Fabric as an opt-in execution kernel on an isolated branch; it does not make Fabric an
accepted dependency or architecture.

Problem:

Verification repeatedly used a model turn to navigate to one profile and another model
turn to probe it. The model served as a step-by-step interpreter for a regular read-only
program.

Discovery:

- Cluster browser traces into repeated action/query sequences.
- Measure variation between instances of the same sequence.
- Identify which decisions genuinely require model judgment.
- Check platform pacing and account-risk constraints.

Fix hypotheses:

- Let the model define a closed, bounded read-only recipe once.
- Execute that recipe serially over a supplied entity list.
- Return typed rows, per-item failures, and evidence ids in batches.
- Reinvoke the model only on exceptions or after a batch.

Evidence required:

- Model turns and wall time per inspected entity.
- Extraction accuracy and missing-field rate.
- Platform challenge/failure rate.
- Quality compared with the current interactive loop.

Discussion and decision:

- Maximum safe batch size.
- Which verbs are allowed in a read-only recipe?
- Keep site knowledge out of product code; recipes must be page/task supplied.

### PERF-04 — Fuse navigation with requested extraction

Status: evidence gathering. Jobs V2: remain open browser-runtime backlog (OBS-05);
telemetry links only.

Problem:

`act(navigate)` returns an observation, but 150 separate probes were still used. In many
cases the next required fields could be requested as part of the navigation result.

Discovery:

- For every probe, check whether the preceding action result already contained the answer.
- Classify genuinely necessary probes versus observation-shape gaps.
- Measure the cost of larger action results against one fewer model turn.

Fix hypotheses:

- Allow a safe post-action read query.
- Add task-defined identity fields to the action result.
- Return a compact extraction plus the normal verification result.

Evidence required:

- Avoidable-probe rate.
- Bytes added per action versus turns removed.
- Extraction correctness and security review of permitted fields.

Discussion and decision:

- Prefer a generic query attachment over page-specific profile fields.
- Decide whether this overlaps enough with PERF-03 to be one implementation.

### PERF-05 — Support targeted scrolling and bounded pagination

Status: evidence gathering. Jobs V2: remain open browser-runtime backlog (OBS-05).

Problem:

Follower-list harvesting opened a dialog but could only request a page-level scroll by
distance. The loop could not reliably target the dialog's scroll container or express
“scroll until new rows or limit.”

Discovery:

- Collect failures involving dialogs, virtualized lists, dropdowns, and nested scrollers.
- Determine whether semantic refs identify scroll containers reliably.
- Measure rows gained per scroll and no-progress behavior.

Fix hypotheses:

- Permit scroll targeting by semantic ref.
- Add bounded `scroll_until` with a predicate, item limit, and no-progress stop.
- Return newly observed rows rather than the entire list.

Evidence required:

- Success across generic fixture shapes and live pages.
- Actions and model turns per 100 harvested rows.
- False targeting and runaway-scroll rate.

Discussion and decision:

- Whether `scroll_until` belongs inside the existing closed action vocabulary or the
  read-only recipe executor.

### PERF-06 — Roll over context instead of accumulating placeholders forever

Status: evidence gathering. Jobs V2: EXEC-04 / CAMPAIGN-02-T03 (does not close).

Problem:

Snapshot compaction worked, but every tool call/result pair remained in the protocol
history. The final 1.61MB context included about 702KB of placeholder messages.

Discovery:

- Attribute live bytes and placeholder bytes by epoch.
- Measure what information later turns actually reference.
- Compare cache economics before and after a structured rollover.
- Test cold resumption from the canonical result ledger.

Fix hypotheses:

- Start a fresh worker at explicit sub-goal or batch boundaries.
- Carry only task card, compact decision summary, browser location, and typed result state.
- Archive the full transcript as evidence without resending it to the model.

Evidence required:

- Context, fresh input, cache reads, latency, and cost.
- Rediscovery and contradiction rates after rollover.
- Completion and result quality.

Discussion and decision:

- A rollover rewrites the prompt and can lose cheap provider cache. Accept only if total
  cost or quality improves.

### PERF-07 — Scope tool schemas to the current phase

Status: evidence gathering. Jobs V2: OBS-04 / CAMPAIGN-04-T02 (does not close).

Problem:

Sixteen tool schemas were resent across 417 turns. Fixed attribution was 55.7% tool
schemas and 31.0% agent card, while action and probe payloads together were 12.7%.

Discovery:

- Record tools actually called by phase.
- Measure schema bytes and tool-selection errors.
- Verify that dynamic capability changes do not recreate the stale-snapshot bug.

Fix hypotheses:

- Expose only planning, collection, review, or artifact tools needed in the current phase.
- Generate prompt capability text from the same central capability state.

Evidence required:

- Fresh/cache token and latency change.
- Missing-tool incidents and incorrect advertised-tool incidents.
- No regression in nested mode restoration.

Discussion and decision:

- Fewer schemas may improve selection as well as cost, but phase transitions must remain
  explicit and observable.

### PERF-08 — Route models by phase and uncertainty

Status: blocked on PERF-01 evidence. Jobs V2: OBS-04 routing hooks / CAMPAIGN-04-T02
(does not close).

Problem:

The latest run already used GPT for six planning turns and GLM for 411 execution turns,
but current metrics cannot attribute model-specific cost or quality. It is unknown whether
GLM caused quality failures, whether the rubric caused them, or whether a stronger model
would simply repeat the same flawed criteria more expensively.

Discovery:

- Attribute cost, latency, and outputs to each model and phase.
- Replay the same fixed evidence records through candidate classifiers without browsing.
- Compare strong-model review only on uncertain items.

Fix hypotheses:

- Strong model for rubric creation, exceptions, and final audit.
- Cheaper model or deterministic extraction for routine browser work.
- Confidence-triggered escalation instead of a fixed model for all execution.

Evidence required:

- Quality and cost by phase/model.
- Escalation frequency and incremental defects caught.
- End-to-end accepted-result cost.

Discussion and decision:

- Do not upgrade execution globally until fixed-evidence evaluation separates model
  weakness from missing quality contracts.

### PERF-09 — Reduce ambiguous observations

Status: evidence gathering. Jobs V2: remain open perception backlog (OBS-05).

Problem:

62 of 236 observations had duplicate `role:name` keys, with a maximum collision count of
20. The wire view also caps controls, which can hide useful rows on dense pages.

Discovery:

- Correlate collisions and truncation with extra probes, wrong targets, and failed actions.
- Capture the surrounding row identity needed to distinguish repeated controls.
- Test dense dialogs and virtualized lists.

Fix hypotheses:

- Use stable row-aware identity and duplicate-group position.
- Prefer scoped extraction for dense repeated content.
- Return cursor/pagination metadata instead of arbitrary top controls.

Evidence required:

- Targeting error rate.
- Additional observations/probes caused by ambiguity.
- Snapshot size and model accuracy.

Discussion and decision:

- Avoid solving this by simply increasing the global control cap.

### PERF-10 — Correct duplicate-work metrics

Status: instrumentation issue. Jobs V2: OBS-04 / CAMPAIGN-04-T02 (does not close).

Problem:

The rollup reports 133 repeated probes because it keys only on serialized query. The same
`main a` query on different profile URLs is classified as duplicate even though it reads
different entities.

Discovery:

- Recompute repetition with URL, page identity, query, and result hash.
- Separate exact duplicate reads from repeated reusable recipes.
- Check navigation and observation duplicate definitions for the same mistake.

Fix hypotheses:

- Key duplicate probes by page identity plus query.
- Add a separate `repeatedRecipe` metric that reveals batching opportunities.

Evidence required:

- Manually validated sample of duplicate classifications.
- Stable counts on existing fixture runs.

Discussion and decision:

- Both facts matter: exact duplicate work is waste; repeated recipes are automation
  opportunities. Do not collapse them into one number.

### PERF-11 — Measure and remove false-positive approval waits

Status: experiment planned. Jobs V2: EFFECT/HUMAN via CAMPAIGN-03-T02/T04 + AGENT-14
(does not close).

Work items: `AGENT-14-T01` and `AGENT-14-T02`.

Problem:

The Berlin checkout run showed five approval prompts for a search submit, cookie decline,
search filter, cart add, and guest-checkout continuation. Together their tool-call waits
were about 45m22s, or 42% of the run. Four were classified from generic `submits-form`;
“Apply the filter” matched `outbound-name`. None crossed the operator's stated boundary of
placing an order or paying.

Discovery:

- Record prompt-created, prompt-resolved, and action-finished timestamps separately.
- Score every ask as necessary, unnecessary, or ambiguous against the exact user request.
- Trace authorization and recoverability rule IDs, form method/action, destination,
  control value, page identity, and inferred effect.
- Test whether sticky approval keys can alias controls reused across workflow stages.

Fix hypotheses:

- Classify authorization from the expected external effect; form submission alone affects
  recoverability but does not prove an outbound consequence.
- Remove generic verbs such as “apply” from outbound-name matching.
- Compile explicit user intent into a bounded effect envelope, such as permitting search,
  filters, cart edits, and checkout review while denying purchase.
- Bind remembered approval to effect, destination/form action, page identity or workflow
  stage, and immutable goal/spec—not only host, control name, and rule.

Evidence required:

- Ask precision and recall on fixtures containing search, filters, cookies, carts,
  checkout review, send/publish, and final purchase.
- Prompt count and wait time per run.
- Zero unapproved consequential effects and zero cross-stage sticky-approval reuse.
- Before/after completion, wall time, and operator-interruption rate on a checkout task.

Discussion and decision:

- Minimize asks without treating all server writes as harmless.
- Decide which low-impact session state may proceed automatically and which data disclosure
  needs an explicit task grant.
- The final commit boundary must remain protected even when its control has a generic name.

### PERF-12 — Detect challenges and stop blocked loops

Status: experiment planned. Jobs V2: HUMAN-01..03 / CAMPAIGN-03-T03 + AGENT-13
(does not close).

Design: `docs/challenge-and-approval-handling.md`.
Work items: `AGENT-13-T01` through `AGENT-13-T04`.

Problem:

At least nine seller domains challenged or denied the Berlin session. A navigation to
`Just a moment...` still returned `ok:true` because the requested URL loaded. Without a
typed outcome or circuit breaker, Digi-Key was retried three times after its first
challenge and the session kept trying origins after evidence suggested the browser/IP was
globally flagged.

Discovery:

- Build a corpus of challenge, access-denied, rate-limit, login, outage, and ordinary
  interstitial observations.
- Record challenge confidence, signals, host, session, first/last timestamps, retries,
  time/turn cost, and eventual recovery.
- Distinguish host-local blocking from a session-wide cluster across origins.
- Measure whether headed persistent profiles and lower request pace reduce incidence.

Fix hypotheses:

- Add a pure, evidence-based `ChallengeDetector` after every browser observation.
- Return a typed `blocked.challenge` outcome even when the action's ordinary postcondition
  passed.
- Trip a host breaker on high-confidence detection and a session breaker after a bounded
  number of distinct challenged hosts.
- Offer immediate takeover when a user is present; otherwise park one resumable intent.
- Resume from a fresh observation and retry only the parked intent once.

Evidence required:

- Detection precision/recall on fixtures and saved live observations.
- Actions, turns, and time after first challenge; target zero autonomous same-host retries
  after a high-confidence block.
- Successful takeover/park/resume without duplicate external effects.
- Challenge rate by browser profile, headed/headless mode, pace, and origin class.

Discussion and decision:

- Detection and safe handoff are product behavior; automated CAPTCHA solving, fingerprint
  spoofing, proxy rotation, and bypass services remain out of scope.
- Choose host and session breaker thresholds from the corpus, not seller-specific rules.

### PERF-13 — Bound failed-action and no-progress loops

Status: evidence gathering. Jobs V2: EXEC-07 / CAMPAIGN-02-T03 + AGENT-15
(does not close).

Work item: `AGENT-15-T01`.

Problem:

Only 97 of 159 `act` calls in the Berlin run returned `ok:true`; 35 returned `ok:false`,
10 were refused before execution, and 17 returned tool errors. Repeated stale refs,
10-second locator timeouts, no-op scrolls, incorrect postconditions, and checkout retries
spent turns without a general stop condition.

Discovery:

- Attribute failures by stage: target resolution, precondition, execution, postcondition,
  challenge, and recovery.
- Group retries by intent, page identity, target, error code, and evidence change.
- Measure time lost to fixed tool timeouts versus model round trips.
- Correlate collisions/truncation with stale refs and wrong targets.

Fix hypotheses:

- Enforce per-intent and per-page no-progress budgets.
- Require new evidence or a changed recovery strategy before repeating an action.
- Return the current page outcome when the effect succeeded but the postcondition was
  misspecified, instead of treating both as one failure.
- Fail fast when a target is known hidden, occluded, stale, or non-actionable and expose a
  typed recovery hint.

Evidence required:

- Success, failure, refusal, and tool-error counts by stage.
- Turns and wall time lost before terminal no-progress.
- Completion and quality with bounded retry fixtures and one comparable live run.
- No increase in premature abandonment where a second strategy would have worked.

Discussion and decision:

- Keep this separate from CAPTCHA handling: challenge is an external blocked state, while
  selector and postcondition churn are executor failures.
- Decide whether the budget belongs in direct tools, the outer runtime, or both.

## Decision review after two additional runs

Do not accept all hypotheses as one package. Review in this order:

1. Data trust: PERF-01 and PERF-10.
2. Result quality: QUAL-01 through QUAL-06.
3. Interaction blockers: PERF-11 through PERF-13.
4. Loop shape: PERF-02 through PERF-06.
5. Prompt and model economics: PERF-07 and PERF-08.
6. Perception reliability: PERF-09.

For each ticket, choose one:

- `accept` — evidence supports implementing the named hypothesis.
- `experiment` — run a controlled A/B or fixture before implementation.
- `reject` — evidence falsifies the hypothesis; record why.
- `defer` — real issue, insufficient impact to prioritize.

Any accepted architecture decision must be added to `docs/decisions.md`. Append the run
and decision outcome to `docs/live-run-evidence-log.md`; never erase the baseline.
