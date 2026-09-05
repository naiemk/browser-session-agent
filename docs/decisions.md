# Decisions

Recorded so a later session does not rediscover them. Status is `accepted` unless noted.

## D1. Native Pi package, not an MCP wrapper

Pi extensions can register tools, swap the active tool set, prompt the TUI, and inject system guidance. That is the product surface the stories describe. An MCP server would add a hop without helping tab ownership, takeover, or evidence.

## D2. Own Playwright worker, do not vendor BetterWright

BetterWright’s host API is sandboxed Playwright JavaScript — excluded by the MVP (“unrestricted scripting”). `pi-browser-harness` drives the user’s existing Chrome. We need a dedicated persistent profile, run-scoped locks, and an evidence log we control.

## D3. One persistent headed Chromium profile

MVP success is a visible login in a durable profile. `launchPersistentContext` plus `--remote-debugging-port` and CDP reconnect is the standard Playwright way to keep cookies/storage and reattach after the worker process restarts.

## D4. In-process worker with durable disk state

A separate daemon is V1 complexity. The Playwright client lives in the Pi process. Crash safety comes from `state.json` + `events.jsonl` + CDP reconnect, not from a second supervisor.

## D5. Semantic refs, not CSS selectors

Agent-facing locators are snapshot refs (`e12`) assigned to visible interactive controls. CSS/XPath are not exposed. This matches the “semantic actions” story and keeps the tool schema small.

## D6. Replace coding tools only while a run is active

`pi.setActiveTools` can hide `bash`/`write`/`edit`. Doing that globally would break normal Pi use. Browser tools are registered at load; they become the active set when `/browser-start` succeeds, and the previous set is restored on stop/complete.

## D7. Evidence lives on disk, not only in the Pi session

Pi `appendEntry` is TUI/session-scoped and is not the resume source. Runs must survive Pi restart and worker restart independently of the conversation transcript.

## D8. User facts are opt-in; strategies are outcome-linked

The story forbids opaque self-modification. Approved knowledge is retrieved as tool results, never patched into product code. User facts stay `candidate` until `/browser-approve`.

## D9. Headless is a test/CI mode, not the product default

The operator must see the tab. Tests launch headless against fixture HTML so CI does not need a display.

## D10. No credential store, no CAPTCHA solver, no live job-board traffic in tests

Takeover is the MVP answer for logins. Fixture pages cover forms, dialogs, verification, and the JSONLint prompt E2E. Hitting real application sites is a manual operator path, not an automated test. Live jsonlint.com is an optional dry-run flag, not the CI gate.

## D11. Desktop is the browser node; the VPS does not run Chrome

The VPS hosts `ui` + `api` + `gateway` (chat, Pi SDK, TLS). Playwright’s bundled Chromium and the persistent profile stay on the operator desktop. The node agent connects **outbound** to the API so the desktop needs no inbound ports. CDP is localhost-only; the API relays screencast frames. One dedicated profile (D3). If the desktop is asleep, browser tools fail closed.

## D12. Use Pi’s cost router, do not write one

Default model choice on the web host is **Pi Router** from `pi-model-auto`: Low / Medium / High / Ultra, cheapest authenticated model that meets the floor. Budgets are `pi-meter` (soft downshift, hard refuse). No second routing layer in this repo.

Policy:

- Inspect, obvious clicks, form fill, JSONLint-class pages → **low/medium**
- Ambiguous DOM, recovery after failed expect, “should I take over?” → **high**
- First-time site / messy SPA / login diagnosis → **ultra**, then downshift
- Compaction / summarization of long evidence → **low**

## D14. Desktop node is a CI-built Docker image

Operators should not install Playwright on the host. CI publishes `browser-session-node` (Playwright base + our agent) to GHCR. The container runs on the desktop with `BSA_HOME` bind-mounted. Default is headless; the web live view is the takeover surface. Headed X11 is optional. The VPS images never include Chromium.

## D15. Consumer V1 is hosted agent + OS helper, not Docker

Non-developers get a Windows/Mac installer and a website. Pairing uses a one-time `bsa://` (or localhost) code exchanged for a keychain device token — no copy-paste of `BSA_TOKEN`. Docker remains a power-user image (D14), not onboarding. The helper is a connector, not a second Electron browser.

## D16. The agent steers from semantic snapshots, not JPEGs

Live-view frames are for humans. The model uses `browser_inspect` refs and bounded actions (D5). One agent step is seconds (inspect + LLM + act), not a realtime video loop.

## D17. Harness accepts actions; the model does not

An act is accepted only after Playwright succeeds and a postcondition (read-back or snapshot delta / expect) passes. No-op clicks are failures. Speed comes from fewer LLM turns (batched fill, reuse act’s observation), not from skipping the harness.

## D18. Page plans, not one LLM call per gesture

The model understands a page once and writes a bounded path program (ordered attempts + predicates). A local interpreter runs it against Playwright and reports progress/actuals. Re-invoke the model on a new page, a finished plan, or an uncovered failure — not after every click. The DSL is closed (existing verbs + `scroll_until` / `click_first`). No model-authored Playwright JS (D2). Targets prefer accessible name over snapshot refs because refs go stale. Each step still passes the harness (D17).

## D13. Web UI is a view over a server-side Agent

`@mariozechner/pi-web-ui`’s in-tab `Agent` cannot host Playwright. The VPS runs `createAgentSession()` and streams `agentEvent`s. The browser renders chat (messages, tool cards, model/thinking selectors) plus a live-view panel. `ctx.ui.input/confirm/select` become in-chat cards. Do not replace Pi with Vercel AI SDK `useChat`.

---

# Autonomous agent decisions (D19+)

Context and open questions live in `docs/autonomous-agent.md`. Status is `accepted` unless marked. A `hypothesis` is not yet a decision: it names how it will be settled. Superseded entries stay, marked, so a later session does not rediscover the dead end.

## D19. Measure before mechanism

Pi is a turn engine; coding-agent competence comes from environment properties, not from harness cleverness. We cannot tell whether a mechanism helped without a scoreboard, so a browser task suite with deterministic per-task success checks is built first, and a baseline is recorded before any mechanism lands. Every run reports success rate, steps per task, and cost per task. Steps and cost are first-class because several candidate mechanisms add turns.

## D20. Task success criteria come from outside the executor

Extends D17 from per-action postconditions to task-level assertions. Coding validation works because tests exist independently of the agent and cannot be weakened by it. Task criteria therefore arrive with the task and are immutable; the agent may add its own step-level checks but never soften or replace the given ones. An agent that authors the criteria that judge it will author trivial ones.

## D21. Read-only probing is open; mutation scripting stays excluded

Amends D2. The useful half of a programmable browser is inspection, and inspection is idempotent, so it is safe to allow freely: a read-only page query returning JSON is the browser's `grep` and is how the agent tests a hypothesis without acting. Mutation through model-authored scripting remains excluded (D2, D18); actions stay on bounded tools and semantic refs (D5). Probe output must not become a selector channel for actions.

## D22. Probe output is sensitive by default

Read-only is not harmless. A probe runs inside the user's real authenticated browser, so it may not touch cookies, `localStorage`, `sessionStorage`, or auth headers; output is hard-capped and truncated; and results are redacted before entering model context, because context becomes transcripts, traces, and logs. The risk being managed is exfiltration, not mutation.

## D23. Reversibility is judged per action, and unknown means committing

"Show more" and "Submit" are the same verb, so reversibility cannot be a static property of a tool. It is judged per action from the affordance (accessible name, form context, destination) and is therefore fallible. Unknown defaults to `committing`. Over-asking is recoverable; an accidental submit is not. Committing actions require the task's given criteria to pass, evidence before and after, and an approval policy of auto, ask, or never.

## D24. Bounded read-only scouting is allowed; site mapping ahead of need is not

Supersedes the earlier blanket "never crawl" rule, which conflated three activities. Rejected: visiting pages because they exist (worst decay, lowest hit rate, highest anti-bot exposure). Allowed and budgeted: read-only scouting of a flow before an irreversible commit. Not exploration at all: enumeration such as pagination, which is the task. Justified only when read-only, bounded by a budget owned by the goal rather than the task, motivated by expected reuse or imminent risk, and revalidated on use. Anti-bot and rate limits are a hard external constraint: this runs on real logged-in accounts where the downside is a flagged account, not a slow run.

## D25. Remembered or predicted knowledge may propose an action, never authorize one

The dangerous cache entry is not the broken one but the plausible one: a selector that still resolves after a redesign while pointing at a different control converts explicit breakage into silent degradation. Any remembered affordance, expectation, or playbook may only seed a fresh perception pass that then passes a check. It may never drive a committing action. Corollary: memory decays by prediction error rather than by clock, and expected outcomes are stored as distributions with frequencies so one A/B variant cannot rewrite a good entry.

## D26. Flow knowledge starts as a planner-emitted outline, not a schema store

Status: accepted, revisit once corrections accumulate. Frontier models already hold the scripts for common flows; asked how to post a story they produce compose, choose media, arrange, publish, choose audience, cancel otherwise. So the planner emits a short stage outline into the task card, which costs nothing and needs no signatures, retrieval, store, or promotion pipeline. Its immediate value is gathering requirements early — asking for the image before opening the app instead of stalling mid-flow. A persistent store is justified only once we hold corrections the model does not already know.

## D27. Session strategy is an open experiment

Status: hypothesis. Fresh bounded sessions per task give clean context but discard what was learned about a site, while Pi's own answer to long context is compaction rather than amnesia, and accumulated understanding is part of why coding agents feel competent. Settled by running the suite both ways: one long compacted session per goal versus a fresh `SessionManager.inMemory()` session per task with a task card and a terminating result tool.

## D28. Planner, task graph, and memory tiers are gated on single-task reliability

Status: hypothesis. A graph over an unreliable executor multiplies failures instead of composing successes, and cross-session memory only pays when page archetypes actually repeat. Both wait for suite evidence: task reliability for the graph, and measured archetype repeat rate plus prediction hit rate for memory. Memory, when built, goes session tier first (never staler than the goal), then per-account (personalization makes shared entries wrong), then a small curated repo-file seed at lowest confidence. Knowledge stays opt-in per D8.

## D29. Prefer mechanisms that reduce turns per task

Probing, checks, and an approval gate can each add turns, and a browser step already costs a page load plus a model call. A change that raises success rate while tripling cost may be a regression in practice. Existing turn-reducers (batched fill, page plans per D18) are the model to follow, and cost per task is reported on every suite run per D19.

## D31. Campaigns are the eventual target; the agent is built to yield

Status: accepted as direction, out of scope to build. Real-world processes run on calendar time over many entities, mostly blocked on other people, where deliberate slowness is correct and volume is a liability (`docs/v2-campaigns.md`). A campaign layer will manage agent runs. We do not build it now, but three cheap choices keep it reachable and are hard to retrofit: `parked` is a normal task outcome carrying a reason, a wake condition, and a perishability flag; durable state is entity-oriented with idempotency keys rather than one run blob; and a task must resume cold, with no session context. Corollary for D27: session memory is a within-day optimization and never the source of truth.

## D32. Human help is queued and batched, never interruptive

A block parks one entity; the scheduler continues with work that is not blocked. Requests accumulate and are presented in one sitting, batched by interaction kind, because the cost being optimized is the human's context switching. Three kinds have different physics: durable decisions (approve a message, pick the matching option) are parkable indefinitely and answerable without the browser; perishable session-bound blocks (CAPTCHA, OTP, an open modal) cannot be held, so we park the intent and re-drive to the blocking point when the human is present rather than freezing a live modal; identity blocks (login, 2FA) need the live browser and existing takeover. This is why `awaiting_takeover` as a whole-run status is insufficient.

## D33. Quality is the objective; throughput is not

We are building a companion, not an automation bot. The objection to automated outreach is un-personalized volume wasting the recipient's time, not the fact that a machine typed it. So the campaign metric is response and acceptance rate, never messages sent — an objective under which spam is self-defeating — with a floor that pauses and replans instead of pushing volume. A committing outreach action additionally requires evidence of personalization: something specific, observed, and verifiable about the recipient. Content trust graduates like knowledge does (D8): individual approval first, batched once the human's edits stop changing the drafts. Separately and honestly, quality does not address platform policy, which measures automation rather than merit; approval at the commit point (D23) and human-like pacing (D24) are the mitigations for that distinct risk.

## D34. The agent core is rebuilt from scratch; transport and product shell are kept

The current agent core carries assumptions we have decided against: verification bolted onto actions, run-scoped rather than entity-scoped state, a closed plan DSL as the only escape hatch, and no oracle the executor cannot fake. It is replaced rather than refactored.

**Kept** — Playwright connection and comms: `src/worker/browser-worker.ts` (persistent context, CDP connect and reconnect, screencast), `src/store/worker-info.ts`, `src/hosts/node-agent/client.ts`, `src/hosts/web/hub.ts` and `hub-registry.ts`, the envelope and framing in `src/hosts/shared/protocol.ts`, plus `bin/` and `deploy/`.

**Kept** — product shell: accounts, sign-in, pairing, installer, the HTTP and WS server in `src/hosts/web/`, and the chat UI. Rebuilding auth and packaging would be waste. The chat UI is expected to change once the new interaction model (parked items, batched human queue, approvals) is settled, but not as part of the core rebuild.

**Rebuilt**: `src/session.ts`, `src/domain/`, `src/plan/`, `src/tools/`, `src/host/`, `src/hosts/web/runtime.ts`, `src/store/run-store.ts`, `src/store/knowledge-store.ts`, `src/operator/`.

Precision on "keep comms": the transport is reusable, the vocabulary is not. Today's RPC verbs (`startRun`, `act`, `inspect`) are shaped around the old primitives. The new core defines its own verb set over the same socket, auth, framing, screencast, and takeover-input path.

Fixture HTML in `tests/fixtures/site/` is kept, and the behavioural expectations it encodes are **ported as new tests**: noop-click rejection, type and select read-back, combobox scroll variants, Monaco editor value extraction, password redaction. No implementation is reused. The point is to avoid rediscovering the same DOM bugs, not to preserve the code that found them.

## D35. Cutover is decided by the suite, and the old core is deleted with it

The old agent is the control group. The baseline row required by D19 is its score, so the rewrite is a measured swap rather than a leap: the new core becomes the default only when it matches or beats that baseline on success rate at equal or lower cost per task across the full suite. The suite runner therefore takes a target switch and can score either system.

The old core is deleted in the same change that flips the default, along with its now-dead tests. Two agent cores may coexist only while that comparison is running, and a third is never allowed. Without this trigger the repo keeps both forever.

## D36. The runtime builds on `pi-agent-core`, so the model can be replaced

`createAgentSession` hardcodes its stream function: it always calls `streamSimple` with a
real key, so there is no seam and every test of the loop would cost money and vary. It also
brings a resource loader, on-disk sessions, settings, and auth that a bounded browser task
does not need. `pi-agent-core`'s `Agent` takes `streamFn` as a first-class option, so the
runtime uses it directly and keeps Pi's real loop — tool execution, errors-as-text,
truncation, queueing — untouched. See `docs/runtime.md`.

## D37. Tests use a mock model, never a live one

Default CI must be free and deterministic, and a test that costs money gets run less, which
is the opposite of what tests are for. The mock implements the same event protocol a
provider does (`start`, content blocks, `done`), honours abort signals, and reports usage,
so everything except the model's judgement is exercised for nothing: real browser, real
loop, real tools, real verification, real commit gate, real criteria.

Two modes. `plan` lists intended tool calls with targets named rather than ref'd, resolving
refs at call time from the newest observation, which is what a real agent must do. `script`
plays raw turns so awkward behaviour can be reproduced deliberately — a model that claims
success without acting, one that repeats a failing click, one that fails with a 402.

The suite's `mock` target reuses each task's reference steps, so no solution knowledge is
duplicated. CI asserts that no provider key is present, because a green build that quietly
depends on a paid call is not testing the guarantee.

## D38. Live baseline runs by hand, on a subset

Competence measurement costs money and is the only thing a live run buys; plumbing
regressions are already caught by the mock target. So the live suite is a
`workflow_dispatch` job, defaulting to a small subset chosen to cover distinct failure
modes rather than to be thorough, with `--all` available. Every run reports tokens and cost
per task so a change that improves success while tripling spend is visible.

## D39. The turn budget is enforced at the model port

Pi's engine has no step limit, and aborting from a `turn_end` listener only signals the
provider — a stream that ignores the signal keeps the loop running, which is what happened
the first time this was built. Capping at the port is simpler and engine-friendly: once the
budget is spent the port returns a turn with no tool calls, so the loop ends because the
model stopped asking for tools. It also costs nothing, since the capped turn never reaches
a provider.

## D40. The CLI is the primary surface

The hosted chat transport was the least reliable part of the old product: sessions dropped
and a disconnect was indistinguishable from a stalled agent. The CLI removes that class of
failure entirely — no socket, no pairing, no background service — and is the easiest thing
to debug when a run goes wrong. `run` exits non-zero unless the criteria pass, so it
composes in a shell, and irreversible actions default to needing approval so an unattended
run cannot submit something by surprise. Hosted use can adopt the same runtime later; it is
a transport, not a different agent.

## D41. Situational awareness is a primitive, not a taxonomy

The agent needs to know where it stands: who it is acting as, what its session grants,
whether what it is reading is reachable by anyone. The tempting fix is to declare the
answers — flags for "own data" and "public data", a list of site categories, a policy table.
Every version of that is wrong for the next site, because the same URL means different
things depending on who is signed in, and the taxonomy has to be maintained per site
forever.

So we give one mechanism instead: load the same URL with no session and compare. It needs
no knowledge of any particular site, and it answers all three questions at once. A redirect
to a login wall, a shorter control list, an identical page — each is a fact the model can
reason from. `compareObservations` deliberately returns differences and never a verdict:
there is no `isPublic` field, because "public" is a conclusion and conclusions belong to
whoever has the task in front of them. A difference is evidence and not proof, since A/B
tests, geography, and consent walls all change an anonymous view for reasons unrelated to
authorization, and the card says so.

The same reasoning governs `remember`: free-form keys chosen by the agent, rather than a
schema of fields we predicted it would need. Each fact carries the ledger event that
established it, so a claim about the situation can always be traced to what was observed.

## D42. A refusal is an outcome, not silence

A model that answers in prose and calls no tools is invisible to a loop that only watches
for reports: it looks identical to a task where nothing happened. That is how a human ends
up arguing with a chatbot for twenty turns while the system believes it is working. So a
run with zero tool calls, no report, and no transport error is recorded as `declined`, and
the evaluator maps a persistent decline to `needs_user_input` — a decision for the human to
rephrase, authorise, or drop.

There is exactly one retry, and only when there are newly established facts to attach. A
refusal is often correct, and a loop that keeps rephrasing until the model agrees is a
machine for talking models out of correct refusals. One retry covers the case worth
covering: the agent declined because it could not tell where it stood, and now it can.

## D43. What counts as the answer is asked; how to get it is chosen

Two failures in the same run looked like one problem called "needs better planning", and
treating them alike would have produced the wrong fix for both. Picking `Following` when
"friend list" also matched `Followers` changes *which entities end up in the result*, so it
is not the agent's to decide. Walking a list by navigating to each item and back rather
than reading each in a side tab changes only the cost, so it is entirely the agent's and
asking about it would be noise.

So: fork on referent, never on route. `note_fork` records that a word in the task matched
more than one thing here, with its own ledger type, because silently choosing a meaning is
a distinct failure from getting the work wrong. Resolution is decided on cost — cover every
branch and label results by source when that is cheap and bounded, ask when it is not —
which also respects the case where the operator does not know either, since a term like
"friends" may not name anything the site actually has.

The tool does not gate acting. Deciding in code whether a goal contains an ambiguous
referent is exactly the kind of cleverness that misfires; the card asks for it and the
suite measures whether it happened.

## D44. Make the cheap route cheap instead of teaching cost

The agent chose an expensive traversal because in its action vocabulary it was the only
traversal. A planner added on top would have chosen the same one, since it would have been
optimising over the same impoverished set. Widen the actions before building machinery to
choose among them.

This is the fourth environment gap, alongside the three in D19's diagnosis: in a repository
a read does not move you, and in a browser it does, and you may not get back. `peek` closes
it — open in a side tab that shares the session, read, close, and nothing moved. There is
deliberately no cost model: making the good route the easy route means the model does not
need to reason about cost to find it. The falsification is explicit, in
`docs/autonomous-agent.md`: if the suite shows the agent still taking the expensive route
with peek available, this was wrong and measure-one-item-then-commit is justified.

The budget rides on action results rather than the card, because the system prompt is set
once and resent verbatim. The nudge lands past halfway, while there is still budget to
change route, and suggests rather than instructs, since we do not know how many items are
left and so cannot say the pace is actually wrong.

Two supporting decisions. Affordances are read, not cached (`survey`): interfaces advertise
their own capabilities because humans must be able to find them, which is one of the few
places the browser is easier than a repository, and it works on a site nobody has seen.
Side tabs stay at one: concurrency would be faster and would look far more like scraping,
and sequential peeking already removes every round trip.

## D45. Perishability is a property of the payload, not of the tool name

Pruning matched a list of tool names and so covered `observe` and `probe` and silently
missed every other tool that returns a page: `act` embeds a snapshot in its result, and
`peek` and the stranger view each return one under their own key. Those snapshots
accumulated untouched and were resent on every subsequent turn, which is the leak the
mechanism existed to prevent.

Deciding by shape — does this result carry a snapshot — fixes the three that were missed
and, more importantly, covers the next tool without anyone remembering to register it. A
list you must maintain is a list that will be wrong, and this one was wrong within two
features of being written.

The newest snapshot per tool still survives, because it is not merely the freshest
information: refs go stale on every action, so the latest action result is where the model
gets the refs for its next one. That is also why dropping the snapshot from a successful
action is a candidate behind the view seam rather than the default — removing it forces an
extra `observe` turn, and a turn costs the card and every schema again, which can exceed
the snapshot it saved. Which way that lands is a measurement, not an argument.

## D46. Delta keys must be unique, and position is the last resort

Keying the page delta on `role:name` looked like React's keyed reconciliation and behaved
like its index-key anti-pattern, only worse: a `Map` silently kept the last of any
duplicate group. On a table of fifty identical `Select` checkboxes, checking any row but
the last compared the survivor against itself and reported nothing, and because a click's
default postcondition is "did the delta change", the harness called a working click a noop
failure and the agent went looking for another route. Appending rows to such a table was
equally invisible. Verified against the old code before the fix: checking row 3 of 50
produced `[]`, and so did adding three rows.

`href` discriminates links cheaply. Beyond that, controls that are genuinely
indistinguishable are separated by their position within the duplicate group, so row three
compares with row three. Mid-list insertions shift those positions and over-report change,
which is the tradeoff React makes with index keys and is the right way round: over-reporting
is recoverable and silently reporting nothing is not.

No existing fixture could reproduce this, because `list.html` labels its rows `Item 1`
through `Item 10`. `rows.html` exists to be the shape that breaks it — identical controls
per row, with the identifying text in a table cell, which is not interactive and so never
reaches a snapshot at all.

## D47. Cost is reported and attributed, never gated

Shipping the job matters more than the token bill, so nothing about cost fails a build. A
gate teaches people to raise the budget, and a bare percentage is noise they learn to
ignore. What survives contact with a busy week is a rise with a cause attached: "context is
up 18%, and 15 of those points are peek results carrying snapshots" is a decision — the new
tool earns its cost or it does not.

So the mechanism is a committed structural baseline, recomputed by the token-free mock
target on every push, and a delta report in the job summary that attributes the movement by
payload. Attribution is scaled by task count first, so adding tasks does not read as a
regression. Token and cache figures stay in the manual live workflow because they cost
money, and a metric present on only one side is skipped rather than compared against zero.

Two supporting boundaries. Metering writes `metrics.jsonl` beside the ledger rather than
into it: the ledger is evidence, redacted and capped and meant to be read years later,
while metering is high-volume and disposable, and mixing them spoils both. And the emit
side is a port in `src/runtime`, so no production code imports `src/optimize` — in
particular the view strategy seam lives in the runtime, because a hot path filed under
"optimize" invites being treated as optional.

## D48. The screen is not the log

A tool result was one string, sent to the model and printed to the terminal. That is two
readers with opposite needs: the model wants every control on the page, and a person
wants to know what just happened. The model won, so a forty-control snapshot scrolled the
interesting part off screen and the operator could not follow their own run.

So there are three destinations, and each has one job. The terminal gets one line per
step, from `summarizeToolResult`, which is shared data rather than per-host formatting so
that the CLI and the chat cannot describe the same step differently. The model gets the
payload, unchanged. And `payloads.jsonl` gets that payload verbatim, which is the only
reason shrinking the screen is safe: nothing is lost, it moves. The hash on each payload
line is the hash on its metrics record, so a line, its cost, and its full text join
without an id threaded through everything.

Drawing lives at the host boundary rather than in the tools, because a tool that knows
what a terminal is cannot be reused by a host that has none.

## D49. Evidence is required, and one thing

Every recording dependency was an optional field reached with `?.` — ledger, goal store,
metrics, screenshot dir, goal root, goal id. The suite passed all six. The product passed
none. So the agent the operator actually ran recorded nothing at all, and `remember`
reported success while storing the fact nowhere. Nothing failed, because there was
nothing to fail: forgetting all six was indistinguishable from choosing to record
nothing.

Six optional fields are a request to remember six things. One required field is a
request to remember one. Recording nothing is still legitimate — tests need it — but it
is spelled `nullEvidence()`, which shows up in a diff, and that is the whole difference
between a decision and an oversight.

The ledger became an interface to make this possible: a chat registers its tools before
the operator has said what they want, so the host supplies a sink that resolves its goal
on first write rather than at startup.

## D50. A pass is believed at once, a failure has to survive a wait

Every verdict about a page came from one read, taken the instant the action returned.
That asks whether something worked before it has had the chance to: a dialog animates
open, a framework renders on the next frame, a row arrives with the response. On the
Instagram run, every reported failure in the trace was of this kind — four of them
dialogs judged mid-animation, one a value read with the wrong predicate.

A false failure is expensive in a way a slow success is not. It goes in the ledger, the
evaluator counts repeats of it as a broken strategy, and the agent abandons a route that
worked and spends turns on a worse one. So the two directions get different treatment,
which is not a hedge but the actual asymmetry of the situation: nothing that has already
happened un-happens, so a pass is final on sight, while "not yet" and "not going to" are
indistinguishable from a single sample and only time tells them apart.

The happy path therefore still costs exactly one read. Only a verdict that is about to
cost a turn pays for a second look, and what it pays is latency, not tokens — which on a
run that was already 75% idle is the cheaper of the two ways to be wrong. The verdict
carries how long it waited, so a failure that survived the window reads differently from
one taken instantly, both to a person and to whatever we build on it next.

Two things follow from reading more than once. The page delta has to be measured from
before the action rather than from whatever the port last saw, or a second read reports
what changed between two polls; that was only accidentally right before. And a read that
throws is "not yet" rather than a failure, because mid-navigation the execution context
is genuinely gone for a moment and that is a fact about when we asked.

## D51. A ref belongs to an element, not to a position

Refs were positional and reassigned from scratch on every look, so one arrival at the top
of a list renumbered every row beneath it: a ref read one turn ago addressed a different
row now. The card had to warn that refs go stale, and the agent obeyed it by observing
before every action — a whole turn, costing the card and every tool schema again, bought
to learn that nothing had moved.

Keeping the marker already in the DOM is enough. New elements are numbered above every ref
the page is carrying, so a fresh number never collides with one the model still holds, and
navigation starts the numbering again because that is a different page. Single-page apps
that replace nodes on render will churn refs anyway, and that is the correct answer there:
the element really is gone.

The property is also load-bearing for anything that wants to describe a page as a change
from the last one. An unchanged control cannot be left out of a snapshot while leaving it
out is also the only way to lose the ability to address it.

## D52. The context is compacted at sub-goal boundaries, not every turn

Cache reads were 74% of the metered run's bill: the same accumulated context re-read on
every one of 112 turns, peaking at 798KB. The obvious response is to prune the stale
snapshots out of it every turn, and the arithmetic says that costs more than doing nothing.
Providers bill a cached prefix at a fraction of the input price and a rewrite near the
front invalidates everything after it, so a context trimmed on every turn is a context
billed as fresh input on every turn — roughly two and a half times the cost on the numbers
from that run. Cache reads were the majority of the bill *because* the prefix was stable.

So compaction happens where a piece of work ends, which is the operator's next message. It
pays the invalidation once and then leaves the prefix alone, and it is also the only point
where the drop is safe: the snapshots being dropped are of pages the last request was
about. The result depends only on where that message is, so every turn inside a piece of
work reproduces the same prefix exactly, which is what keeps the cache warm.

What survives is the decision, not the mechanism. Snapshots go. The agent's own account of
what it worked out stays, as does every non-snapshot tool result — which is where
`remember` keeps what was established, so a new sub-goal inherits the facts without
inheriting the pages they came from. One snapshot is kept so the next sub-goal starts with
something addressable rather than with nothing.

## D53. How a page is described is a strategy, and the default is the one being measured

A control is four short strings and a few booleans, and JSON spends more on saying so than
on the strings: forty-four characters to carry seventeen, with the field names repeated for
every row of every snapshot of every turn. A table says the field names nowhere.

The seam already existed for exactly this, so the table is a strategy behind it and the
suite compares them: tool result bytes down 21% at 29/29 passing. What the suite cannot
tell us is whether a real model reads a table as well as it reads objects, because the mock
reads it perfectly by construction. That question has one honest answer — a real run — and
a real run only ever measures the default. So the candidate that has passed everything we
can cheaply test becomes the default, and `--view flat` or `BSA_VIEW=flat` restores the
baseline in one word.

Two things had to change before a candidate could be compared at all, both of which had
quietly assumed the baseline's shape. Snapshot metering read the control list as an array,
so it counted zero snapshots the moment a description stopped sending objects. And a view
now answers two separate questions rather than one: which snapshot's refs are live, and
which snapshots were billed. A peek reports a page it has already closed, so its refs
address a tab that no longer exists — countable, not actionable.

## D54. Perception and resolution are one strategy

A ref is not data. It is a promise that whatever minted it can hand the element back. Ours
are attributes found by a CSS selector; a CDP perceiver's would be node ids with no CSS
address. Split those two and swapping the first quietly breaks the second, so they are
one interface, injected at the single place the port used to call `perceive` and
`refSelector`.

The first candidate behind that seam is subtractive, not additive. Finding more controls
— listeners, pointer cursors, shadow roots — competes for a budget we are already
spending. Dropping controls a click cannot reach, and children that live inside a control
we already have, frees that budget for the thing the agent opened the page to see. On the
corpus page that stands in for a follower dialog, the reference offered 80 of 99 and still
could not put follower37 on the wire; lean offered 48 and could, because 51 of those 99
were buried under the backdrop.

The two filters are Browser Use's, transcribed with their names and their constants, from
commit cfe10a2. Their paint-order union is not: we can hit-test, they cannot. Off-viewport
is not occluded. Same asymmetry as D50 — do not act on a negative you cannot confirm.

## D30. Rehearsal is deferred, not rejected

Status: deferred. Walking a risky flow to the last pre-commit step, cancelling, and verifying no trace is the closest browser analogue to learning where the point of no return is. It needs a cancel affordance, trace verification, and first-use approval, and it only pays when an archetype recurs. The cheap substitute is D23: do not commit until the given criteria pass, and ask the first time. Revisit if the suite shows tasks failing specifically for want of foreknowledge at the commit step.
