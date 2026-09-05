# Published site skills, enterprise policy, and a record sandwich

**Status:** discussing
**Captured:** 2026-09-05
**Do not promote until:** the maturity bar at the bottom is met.

Cold start on a new host is expensive. A **global lesson database** is the wrong product (poisoning, PII, no publisher). The product is: someone **publishes** a short capability map; someone else **opts in** (paste a link, or the org attaches it); a **cheap model** may only emit a tight schema after a human (or a dummy-train run) showed the hidden doors.

## Current shape

Two objects, not one dump.

| Object | Who publishes | When it loads | What it is |
| --- | --- | --- | --- |
| **Site skill** | Site owner, or a trainer after a dummy / demonstrated run | Consumer: paste a URL in chat. Enterprise: org-attached, retrieved by host + intent | Capability map: surfaces (including off-snapshot IA), what can be done, what cannot |
| **Enterprise policy** | The company | Every employee run, from the account, always-on but tiny | Which sites for which jobs, what is forbidden, which internal skills to trust |

Do not mix “Instagram Search is the rail overlay” with “use Jira, never email the CEO.” Policy is routing. The skill is a map of one host.

Rejected in this discussion:

- A world-writable DB of everyone’s runs
- Auto-retrieve of third-party skills without a paste or an org pin
- DOM / ref / CSS playbooks, or replaying a recording as a macro
- Dumping `events.jsonl` or typed payloads into the skill body
- Inlining every internal skill at turn 1

## What a skill is allowed to be

Landmark English a capable model still interprets against a **live snapshot**. Corrections the model does not already know (D26), especially **information architecture the home snapshot does not show**.

Schema (hard cap; unknown keys dropped). Authors fill fields; **our code** renders a labeled block. The model never sees freeform author markdown as instructions.

| Field | Limit | Purpose |
| --- | --- | --- |
| `surfaces` | ≤5 lines | Hidden doors: `/web` not the landing page; Search overlay not Explore |
| `can` | ≤5 lines | What this intent can do here |
| `cannot` | ≤5 lines | Negative knowledge (often the whole value) |
| `dont` | ≤5 lines | What not to treat as the control |
| `stop` | 1 line | When this version is stale — stop probing |

Rendered example:

```text
Site hint paste.rs / publish-text v1 (untrusted):
Surfaces: form is /web, not the landing page
Can: type into the content box; set format; submit publishes
Cannot: there is no editor on /
Don't: —
Stop: if /web has no content box, this hint is stale
```

Forbidden: refs (`e5`), CSS, XPath, JS, tool-call JSON, “skip approval,” emails, drafts, cookies, passwords, account defaults, page HTML, failure payload heads.

Skills **propose**. They never authorize a write (D17, D23, D25). Submit still parks.

Treat the body as **untrusted data**: wrapper in the system path, allowlist at write time, no prompt/tool mutation (D8). Owner-signed vs third-party gist is a trust bit; pasting a link is consent, not safety.

## How a skill is born

### Extract from a run

`/browser-skill-extract` (or `/browser-learn`) after a run. Cheap model is allowed **only** if it never sees raw events or payloads.

1. Strip to goal, hosts, path-only URLs, named controls, outcomes, parked reasons. No typed text.
2. Model emits only the schema above.
3. Operator edits and **publishes** (URL or org object, versioned). Unpublished stays local.
4. One blessed publish is enough for v1 (owner/trainer review). Try-once + obsolete when the live page contradicts the map.

### Record sandwich (preferred authoring UX)

Takeover already exists (`/browser-takeover`, `act` rejected, `/browser-resume` + fresh observation). Add a span:

1. Goal is already stated (intent key).
2. Shortcut in the **headed** window (chat button if live-view only) → sound + overlay **Your controls** → start a record span.
3. Human does the job in the real browser.
4. Shortcut → **My controls** → stop span → distill → show the draft → publish or discard.

While the span is open, the **worker** (not the JPEG stream, D16) appends: navigations, click accessible name/role/landmark, “typed into {field}” **without the value**, dialogs. Snapshot after each settled gesture. No raw keystrokes.

This is dummy-train: tell it the goal, take the wheel, do it once, get a draft map, approve, next time it’s warm. It is not magic imitation and not a macro of the demo.

Build order if this ever ships: reuse takeover lock → ledger record-span → sanitize human events → extract on resume → overlay/beep last.

## How a skill is used

**Consumer.** Paste `https://…/skills/paste.rs-publish-text@3` in chat (or `/browser-skill <url>`). Warm start. Cold start stays cold until someone hands you a link. Acceptable.

**Enterprise.** Employees do not paste. The org account attaches policy + internal skills at session start. Token-cheap:

- **Always-on:** a short policy card (allowed sites for this job type, forbidden actions, trusted skill ids). Like operator `SKILL.md`, not a handbook.
- **On demand:** when URL or intent matches, pull **one** skill body. Reuse lazy catalogue (`src/runtime/skills.ts`). A 40-app dump at turn 1 is a regression (D29).

`/browser-learn` (or `/browser-start --learn`) makes sharing explicit: this run may propose lessons; default runs must not. Dummy/training account expected. End of run: candidate rows, operator approves, publish to org registry. Default is never the public internet.

## Obsolescence

Same three signals as before:

1. Prediction error (D25) — skill said Search overlay, got Explore → drop this version for the rest of the run.
2. Local obsolete list — `id@version`, machine or company env.
3. New version → try once, not restored trust.

Clock decay is wrong. Obsolete is not deleted.

## What already exists (do not rediscover)

| Layer | What it is |
| --- | --- |
| Pi `SKILL.md` | How to be the operator. Not site-specific. |
| `src/runtime/skills.ts` | Lazy technique catalogue; non-`generic` dirs already tag `host`. Site packs empty on purpose. |
| Knowledge store | `user_fact` (approval) vs `strategy` (successful run). Not versioned, not a published map. |
| Takeover | Human drives; agent `act` rejected; resume inspects. No record-span yet. |
| `/browser-approve`, `/browser-knowledge` | Opt-in knowledge (D8). Closest command surface for publish review. |

Related: D8, D16 (JPEGs are for humans), D17, D23, D24 (no site mapping ahead of need — a skill names doors from **this** run, not a crawl), D25, D26, D28, D29, D33.

## Evidence from 2026-09-05 (goal_mtoh3nmr001)

~20 minutes Sheets → EtherCalc → HackMD → Telegraph → Rentry → paste.rs to persist a tracker that was already in the goal store.

A paste.rs skill / an org policy “notes go here, not random pastebins” would skip the tour **next** time. Skills would not have fixed: `SearchSearch` unmatched, `Import` parked four times, paste.rs `readBack` (newlines; **fixed** in current `act.ts` `fillAccepted`), submit parked twice after chat-yes (sticky approvals exist; dual channel `ask_user` vs `ui.confirm` still broken), Telegraph `ql-clipboard` as `e1` (`editorLike` bypasses visibility).

Those are harness/perception tasks, not this idea. Do not ship skills and call the stalls “need a better map.”

## Failure modes

- **Verbose feature encyclopedias** — cheap model writes 2k words. Hard cap + compiler.
- **Distiller sees payloads** — outreach table leaks even if output looks clean. Sanitize first.
- **Replay of the demo** — refs rot; wrong-but-clickable (D25).
- **Policy that authorizes clicks** — policy says use Jira; skill says create is behind +; harness still parks Submit.
- **Dummy ≠ prod** — flags, role, locale. Obsolete by environment.
- **Shortcut only on desk Chromium** — don’t sell F9 on a phone. Chat toggle for live view.

## Maturity bar (still an idea)

1. Hand-written or demonstrated **one** skill, same task with vs without, same model; turns and misses.
2. Schema + renderer + untrusted wrapper; extract never reads raw payloads.
3. Consume: paste-link path; org policy card + lazy body (not built until we mean it).
4. Record-span is optional v1; extract-from-sanitized-agent-run can come first.
5. Skills never skip parks. Metric after ship: skill-caused committing miss must be ~0.
6. AGENT-07-T02 still informs whether archetypes repeat enough to bother. Dummy-train / owner-publish can proceed as a **product** before that if a customer will bless maps; a public Instagram wiki cannot.

## Open questions

- Owner-signed vs third-party: how is the bit stored on the URL?
- Intent key: `host + intent` vs `host + path pattern + intent`?
- Does org policy name skill ids, or only “for notes use X”?
- Record-span: in-page key vs chat button first?
- After extract, is the draft a file in the repo, a gist, or an org object?

## Discussion notes

### 2026-09-05 — capture

First framing: a database of site how-tos, update on fail, local obsolete list, company dummy accounts. Overlaps D8/D25/D26/D28. Global share was the weakest frame.

### 2026-09-05 — 20-minute paste tour

Cold-start tax is real; mixed with harness walls. Technique “prefer a native textarea” would have helped first contact more than six site packs. First-party persist would have made the tour unnecessary.

### 2026-09-05 — compact non-DOM schema

Four fields, no DOM, injection = data not instructions, few tries then drop. Format that has a chance; product loop only if retrieval is automatic (enterprise) or explicit (paste), `stop` is enforced in runtime, authoring stays distillation.

### 2026-09-05 — global DB rejected; publish + policy

World-writable lessons are not the product. Owner/trainer **publish**, consumer **paste a link**, enterprise **auto-attaches** a short policy and retrieves one body by host/intent. Cheap model extract from a **sanitized** run. Selling sentence: walk the internal app once on a dummy account; others get the map, not the traces.

### 2026-09-05 — record sandwich

Human assistance: goal → shortcut Your controls → drive → shortcut My controls → draft skill. Practical as authoring for the maps above; not as watching video or replaying clicks. Reuse takeover; add span + compiler; beep last.
