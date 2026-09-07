# Exploration vs authorization

Status: ready
Area: runtime / core
Depends on: AGENT-05 (commit gate), AGENT-06 (checkpoints)

## Problem

Live TUI run `goal_mtq2nd62001`: Users / Got it / Try again parked because unmatched clicks classified as `committing` and chat policy was `ask`. That asked the wrong question. Exploring a site is the job. Approval is for world-commits (Send / Pay / Delete), not for classifier ignorance.

Same failure on shipping `main` in `goal_mtqh3r61001`: LinkedIn people-search parked on **Current companies** (`no rule matched "Current companies"`). That is a filter chip. **Invite Ali to connect** is the outbound commit and should still ask. Do not add Current companies to `BENIGN`.

One axis (`reversibility`) was answering two questions. Unknown name → `committing` → human `confirm`. The cost of an unknown click belongs in the **loop** (checkpoint, try, restore), not in a parked TUI. Irreversible ≠ ask. Planning still prefers reversible-first; the gate no longer treats ignorance as a world-commit.

This does **not** add names (`Got it`, `Users`, `Try again`) to `BENIGN`. It does **not** wrap OpenRouter HTML; Pi owns provider errors. It does **not** add another snapshot-prune pass.

## Tickets

### T1 — Two judgments from one `classifyAction`

Split today’s one classification in `src/core/reversibility.ts`. Keep a single choke point so call sites stay one function; return both fields plus two `ruleId`s.

- **Recoverability** (loop): `probe` | `reversible` | `navigational` | `unknown`. Unknown = we do not assume the click is Show more. Default for unmatched / unnamed / missing ref.
- **Authorization** (human): `none` | `outbound` | `destructive`. Positive match on the existing OUTBOUND / DESTRUCTIVE name rules and on a submitting control that is not a search/view change. Default is **none**. Unmatched is not authorized.

Keep the field name `reversibility` on `Classification` / `ActionResult` as recoverability (`unknown` replaces `committing`). Add `authorization`, `authorizationReason`, `authorizationRuleId`.

Acceptance: a Users-like name and a Send name on the same `click` verb classify differently on authorization; unmatched Import is `unknown` / `none`, not a human ask.

### T2 — Gate `approve()` only on authorization

`src/core/gate.ts` today: `reversibility !== "committing"` → run; else policy. Change to:

- Authorization `none` → run (even under `ask` / `never`).
- Authorization set + `ask` → sticky `confirm` (key: host + kind + name + **authorization** rule).
- Authorization set + `never` → refuse.
- Authorization set + `auto` → run with evidence.
- Before/after screenshots stay on **authorized** commits only.

Policy default stays `ask`. `ask` now means “ask on Send”, not “ask on Users”. Expect on authorized commits remains a **precondition**. Expect on exploration is a **postcondition** (see T3).

Acceptance: Send still parks under `ask`; a nameless exploration click does not.

### T3 — Checkpoint unknown and navigational; restore on failed expect / explicit backtrack

Checkpoints already run only for `navigational`. Extend to `unknown`. `restoreCheckpoint` is test-only today. Wire:

- If an **unknown** action (authorization `none`) has `expect` and the expect fails: restore, then return the failure (model is back on the prior page).
- Explicit backtrack: `act` `kind: "restore"` (latest tag). In-page facets that do not change the URL still undo via reload + field restore.

Acceptance: unknown click writes a checkpoint; failed expect restores; `kind: "restore"` reloads the latest tagged snapshot.

### T4 — Card, tool copy, D23, AGENT-05 story

- Card: explore and restore freely; ask only when something leaves this session (send, pay, delete).
- Parked note in `src/runtime/tools.ts` must not fire for unmatched exploration.
- Amend `docs/decisions.md` D23.
- AGENT-05 story text still says “unknown resolves to committing” and “every committing action waits on policy”. Update those lines so work-items do not contradict the amendment.

### T5 — Measure the gate

Ledger/metrics: counts of asks on `authorization=none` (should be 0) vs asks on outbound/destructive. The live run’s four approvals were all unmatched — that series should become zero.

### T6 — Expect kinds in the schema

Runtime already rejects unknown predicates (`validatePredicate`). The model still sent `expect.kind: "text"` because `PredicateSchema.kind` is an open `Type.String()` and probe’s query kind *is* `text`. Same later live run (`goal_mtqh3r61001`) sent `expect.kind: "role"`. Close the enum to `PREDICATE_KINDS` (`text_visible`, `dialog_open`; not `text` or `role`).

## Out of scope

- Longer `BENIGN` lists as the approval fix.
- Custom one-line OpenRouter / Next.js 404 wrapping.
- Another snapshot-prune pass (AGENT-11-T05 already keeps one live snapshot per epoch).
- Localhost servers from coder vs parent Chromium; Pi 0.85.1.

## Implementation sketch

```
act request
  ├─ recoverability  →  navigational|unknown → checkpoint
  │                    unknown + expect failed → restore then fail
  └─ authorization   →  none → run
                       outbound|destructive → policy (ask/auto/never)
```
