# Challenge and approval handling

Status: investigation design. No behavioral change is accepted yet.

Related work:

- PERF-11 through PERF-13 in `docs/live-run-investigation-plan.md`
- `work-items/stories/agent-13-challenge-resilience.md`
- `work-items/stories/agent-14-effect-aware-approval.md`
- `docs/jobs-v2-spec.md` (HUMAN-*, EFFECT-*; CAMPAIGN-03-T02..T04)
- `docs/jobs-v2-evaluation.md`
- `docs/long-running-jobs.md` (product overview; defers to Jobs V2 spec)
- `work-items/epics/v2-campaigns.md`

Jobs V2 consumes the attempt-level challenge and approval contracts defined here; it does
not claim CAPTCHA solving, nondelegable enforcement, or headed rehydration are
implemented before their AGENT-13/14 and CAMPAIGN-03 evidence gates pass.
## Evidence

Run `goal_mtt17kx6001` took about 108 minutes.

- Five approval prompts held tool calls open for approximately 45m22s.
- The prompts covered search, cookie decline, filtering, adding to cart, and advancing
  checkout—not the forbidden purchase/payment boundary.
- Four asks came from the generic `submits-form` rule. “Apply the filter” matched
  `outbound-name`.
- At least nine origins returned Cloudflare, 403, or access-denied pages. There were 17
  observations titled `Just a moment...`.
- Challenge navigations commonly returned `ok:true` because the URL postcondition passed.
- Digi-Key was retried three times after the first challenge.
- Only 97 of 159 `act` calls returned `ok:true`.
- The current spec requires `credential`, `otp`, and `captcha` in `neverPreapprove`, but
  the gate does not independently classify or enforce those categories; only destructive
  authorization and payment-like names are checked there.

These are distinct failures:

1. The approval classifier confuses mechanism with consequence.
2. The browser result cannot represent an externally blocked state.
3. The host has no retry/no-progress budget spanning model turns.

## Goals

1. Ask only when an action crosses a consequential boundary not already authorized by the
   user's explicit request.
2. Never let a generic control name or sticky approval authorize a different workflow
   stage.
3. Detect challenge pages from observable evidence and terminate the current operation.
4. Offer one clear takeover or durable parked continuation.
5. Prevent repeated blocked or no-progress actions without adding site-specific logic.
6. Preserve the current guard, evidence, browser ownership, and final-commit protections.

## Non-goals

- Solving CAPTCHAs automatically.
- Fingerprint spoofing, proxy rotation, bypass services, or stealth automation.
- Encoding seller, social network, or Cloudflare-specific business logic.
- Treating every 403, login page, or empty page as a CAPTCHA.
- Removing approval from purchase, payment, sending, publishing, deletion, or another
  consequential effect.

## One typed operation outcome

Browser actions, direct execution, and experimental Fabric batches should use the same
terminal vocabulary:

```typescript
type OperationOutcome<T> =
  | { status: "completed"; value: T; evidenceIds: string[] }
  | { status: "failed"; stage: FailureStage; code: string; retryable: boolean; evidenceIds: string[] }
  | { status: "blocked"; block: BlockReason; checkpoint: OperationCheckpoint; evidenceIds: string[] }
  | { status: "cancelled"; checkpoint: OperationCheckpoint; evidenceIds: string[] };

type BlockReason =
  | { kind: "challenge"; confidence: number; signals: ChallengeSignal[]; host: string }
  | { kind: "approval"; effectId: string; detail: string }
  | { kind: "authentication" | "permission" | "rate_limit" | "takeover"; detail: string };
```

A challenge classification overrides an ordinary action postcondition. Loading the
requested URL is not success when the returned page is a challenge.

The checkpoint stores semantic intent, stable page/operation identity, effect state, and
evidence IDs. It does not store an actionable DOM ref as a resume cursor.

## Challenge detector

`ChallengeDetector` is a pure classifier over the same redacted evidence already produced
by observation:

- URL and title;
- visible headings/text;
- semantic controls;
- response status and selected failed requests when available;
- known challenge-resource requests;
- page transition and repeated no-progress signals.

It returns `none`, `possible`, or `high_confidence` with matched signals. Signals are
generic classes, such as challenge title/template, verification language, challenge
resource, access-denied response, and interactive human-verification control. Vendor names
may be fixture labels but are not branching logic.

A single weak signal, such as HTTP 403, is not enough: it can be authorization, geography,
or an outage. High confidence requires either one strong template signal or multiple
independent weak signals.

Detection runs after every observation, including successful navigation, failed action,
resume, and Fabric provider return.

## Circuit breakers

The host-level `ResourceCoordinator` owns breakers; the model cannot reset them. For
durable jobs, resource state is shared across every job using the same browser
profile/account. It is not copied into each job's scheduler record.

Host breaker:

- high-confidence challenge immediately blocks the current host;
- no autonomous action may target that host while blocked;
- one explicit resume may retry the parked intent after a fresh observation;
- a repeated challenge reopens the breaker with a longer cooldown.

Session breaker:

- count distinct challenged hosts and total challenge outcomes in a rolling window;
- once a measured threshold is reached, stop trying new origins of the same operation
  class and offer one takeover/network-change handoff;
- do not infer that every website is blocked forever.

No-progress breaker:

- key attempts by goal, page identity, intent, target, and failure stage;
- a retry requires changed evidence or a different recovery strategy;
- stop after the bounded attempt or elapsed-time budget and return a checkpoint.

Initial thresholds belong in experiment configuration and must be selected from fixture and
live-run evidence. They are not silently increased.

Breaker scopes are typed: work item, host/account, browser profile, and execution session.
A case-local failure cannot stop unrelated cases; a profile-wide challenge must stop every
affected job. An expired cooldown makes a resource eligible for explicit reconciliation,
not proof that a human-only challenge was resolved.

## Human flows

Interactive user:

1. Stop all browser actions.
2. Focus the owned tab and set `awaiting_takeover`.
3. Explain which host and intended operation are blocked.
4. The user resolves the challenge or chooses to skip.
5. Resume takes a fresh observation, reclassifies the page, and retries only the parked
   intent once.

Deferred job:

1. Persist the intent, host, page identity, checkpoint, and evidence IDs.
2. Park one `challenge` human item; do not create one item per retry.
3. A later tick cannot target the blocked host while the item is unresolved, regardless of
   timer expiry.
4. Preparing the item starts one headed rehydration attempt and re-drives the intent to
   fresh evidence rather than replaying a stale ref.
5. The user takes over if the challenge is still present.
6. Resume re-observes and evaluates the operation oracle. A UI “resolved” response alone
   never marks the work complete.

Scheduled workers never hold a model tool call open for a person. Challenge, approval, and
identity blocks are committed durably and release the model/browser lease. Interactive
one-shot runs may use a synchronous UI prompt, but they produce the same typed record.

## Effect-aware approval

Recoverability and authorization remain separate.

- Form submission, navigation, and server-visible state affect recoverability and evidence.
- Authorization is based on the expected external consequence: disclose, send, publish,
  purchase, pay, delete, grant access, or another operator-defined effect.
- A GET/POST mechanism or the word “apply” is not itself an outbound consequence.

The planner/host records a bounded effect envelope from explicit user intent. For example,
“add five to cart, verify checkout, do not order” can allow:

- search and filtering;
- cookie preference changes;
- cart mutation;
- checkout navigation;
- use of explicitly supplied placeholder data;

while denying purchase, payment, and order placement.

The envelope is generic: effects, hosts/scopes, expiry, goal/spec hash, and limits. It does
not contain shop-specific actions.

If intent is ambiguous, ask once when establishing the envelope, not at every mechanical
step.

In durable work, an uncovered effect creates one deduplicated `blocked.approval` request.
Grant consumption and effect dispatch are one fenced durable transition. Approval may
make the work eligible again; it does not claim the external effect happened.

## Remembered approval identity

A remembered approval must include:

- immutable goal/spec hash;
- host and destination or form action;
- normalized expected effect;
- workflow/page identity or stage;
- control kind and stable target identity;
- relevant amount, audience, or entity limit when applicable;
- expiry and use count.

Raw accessible name is supporting evidence, not the identity. Controls such as
`form Options[_nextpage]` can recur across stages and must not share approval merely because
their names match.

Nondelegable actions such as CAPTCHA completion, credential entry, and final financial
commit remain outside reusable grants.

## Telemetry

Record:

- job, spec, case, work-item, attempt, operation, and effect IDs where applicable;
- intent, page identity, host/profile resource key, and execution mode;
- outcome and failure/block stage;
- detector confidence and matched signals;
- host/session breaker transitions;
- retries before and after first challenge;
- prompt-created, prompt-resolved, and action-finished timestamps;
- ask reason/rules, effect, envelope/grant ID, and whether the ask was necessary in review;
- remembered-approval match fields;
- takeover/park/resume timestamps and result;
- turns, browser calls, tokens, and wall time after the first blocked/no-progress outcome.

Do not estimate prompt wait from surrounding ledger events once explicit timestamps exist.

## Experiment sequence

1. Instrument prompt timing, action stages, challenge signals, and retry chains without
   changing behavior.
2. Validate detector precision/recall on saved observations and deterministic fixtures.
3. Enable typed challenge outcomes and host breaker behind an experimental flag.
4. Add takeover/park/resume re-drive and session challenge budget.
5. Correct approval rules and add an intent-bound effect envelope behind a separate flag.
6. A/B persistent headed profile and paced navigation using the same tasks.
7. Integrate the same terminal outcome into Fabric batches; a challenge must stop the
   batch and return its checkpoint.
8. Integrate shared breakers, asynchronous approval, and headed rehydration into the
   transactional durable-work repository.

Do not combine all changes in one comparison.

## Evidence thresholds

- Challenge detector precision at least 98% and recall at least 95% on the reviewed corpus.
- Zero autonomous same-host retries after a high-confidence challenge.
- Zero browser calls after a breaker opens except explicit takeover/resume.
- Approval ask precision at least 90% on the effect fixture set.
- Zero unapproved consequential effects and zero cross-stage approval aliasing.
- At least 30% lower wall time on a challenge/checkout task without lower completion or
  evidence coverage.

Thresholds are initial decision criteria, not accepted production guarantees.

## Open questions

1. Which response metadata can the browser port expose without leaking sensitive content?
2. What session-breaker key groups related operations without adding domain knowledge?
3. Does a persistent headed profile materially reduce challenges, or is network reputation
   dominant?
4. Which explicit user phrases can safely compile to an effect envelope without a
   confirmation?
5. Should low-impact cart state be auto-authorized globally or only by task intent?
6. Which semantic checkpoint fields minimize the cost of headed rehydration without
   making stale page structure authoritative?
