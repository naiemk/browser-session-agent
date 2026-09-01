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

## D13. Web UI is a view over a server-side Agent

`@mariozechner/pi-web-ui`’s in-tab `Agent` cannot host Playwright. The VPS runs `createAgentSession()` and streams `agentEvent`s. The browser renders chat (messages, tool cards, model/thinking selectors) plus a live-view panel. `ctx.ui.input/confirm/select` become in-chat cards. Do not replace Pi with Vercel AI SDK `useChat`.
