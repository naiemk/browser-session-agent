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

## D30. Rehearsal is deferred, not rejected

Status: deferred. Walking a risky flow to the last pre-commit step, cancelling, and verifying no trace is the closest browser analogue to learning where the point of no return is. It needs a cancel affordance, trace verification, and first-use approval, and it only pays when an archetype recurs. The cheap substitute is D23: do not commit until the given criteria pass, and ask the first time. Revisit if the suite shows tasks failing specifically for want of foreknowledge at the commit step.
