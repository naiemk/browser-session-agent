# Site skills: a shared, versioned, obsolete-able how-to for websites

**Status:** discussing
**Captured:** 2026-09-05
**Do not promote until:** the maturity bar at the bottom is met. D26 already recorded “we over-engineered flow knowledge within minutes of a good example.” This idea is that same temptation, with a better commercial story.

## The problem

A large share of spend on a new site is not doing the job. It is discovering *how this site works*: where search lives, that Instagram search is not “people in a city,” that a filter is behind a chip, that the composer is a contenteditable not a textarea.

The agent probes, fails, retries, and sometimes gives up. The next session on the same site starts over. Another operator on another machine starts over again.

That is the cold-start tax. The idea is to pay it once, store the lesson as a **skill**, and reuse it.

## The proposal (as stated)

- A **database of skills**. Each skill teaches the agent how to work with a website (or a class of pages on that site).
- As we probe, fail, and learn, we **update the skill**. Others can learn from the experiment.
- A skill can be **wrong** because the site changed or the context changed. Then we stop using it and mark it **obsolete**.
- Keep a **local record** of which skills are obsolete. When a new version arrives, try it.
- A company can use the same technique to **train an agent on an internal app with dummy accounts**, so other employees get a cheap, already-taught operator.

## What already exists (do not rediscover)

This idea overlaps three live systems. If we treat it as greenfield we will rebuild them badly.

| Layer | What it is | What it is not |
| --- | --- | --- |
| Pi `SKILL.md` | How to *be* the operator (tools, evidence, when to stop). Always in play. | Not site-specific. |
| Lazy technique skills (`src/runtime/skills.ts`) | Host-independent technique. Catalogue of names/descriptions in context; body on disk until asked. Loader already groups by directory and can tag a `host`. **Site packs are deliberately empty.** | Not a flow encyclopedia. |
| Knowledge store | `user_fact` (approval) vs `strategy` (linked to a successful run). Lexical retrieval. D8, D25. | Not versioned, not shared across machines, not obsolete-as-a-first-class-state. |

Related decisions:

- **D8** — user facts are opt-in. Strategies are outcome-linked. No silent prompt or code mutation.
- **D17** — the harness still accepts or rejects. A skill must not skip checks.
- **D23** — reversibility is per action. A remembered flow does not make a write “safe.”
- **D25** — remembered knowledge may *propose*, never *authorize*. Dangerous cache is a selector that still resolves and points at the wrong control. Memory decays by **prediction error**, not a clock.
- **D26** — flow knowledge starts as a planner-emitted outline, not a schema store. Persist only once we hold **corrections the model does not already know**. Status: accepted, revisit when corrections accumulate.
- **D28** — memory tiers gated on measured archetype repeat rate. Session → per-account → curated repo-file. Still a hypothesis. AGENT-07-T02 (instrumentation) is **todo**.
- **D29** — prefer mechanisms that reduce turns. Stuffing skills into every card can cost more than they save.
- **D33** — quality, not throughput. Sharing “how to automate Instagram” may hit platform policy.

Code already says the quiet part: *site-specific packs have to be earned from repeated traces, and a candidate is not knowledge until it has worked more than once.*

## Three different things named “skill”

Keep them separate or the design collapses.

1. **Operator skill** — how this product uses a browser. Already shipped.
2. **Technique skill** — “prefer landmark chrome,” “search is usually a combobox.” Generic. Cheap to share. Low obsolescence.
3. **Site skill** — “on this host, for this intent, do it this way.” This idea. High value, high rot, high poison risk.

The interesting object is (3). (1) and (2) should not grow a versioned obsolete database.

## What a site skill is allowed to be

Guidance a capable model still has to interpret against a live snapshot.

Good (stable under ref churn):

- Where the capability lives (“people search is the Search item in the left rail, not Explore, not a `/search?q=` people filter”).
- Order of a flow (“composer, then audience, then post — not the reverse”).
- Negative knowledge (“this query box does not search users by city”).
- What *not* to treat as the control (“the first textbox is the composer, not search”).

Bad (dies on the next paint, or skips the harness):

- `click e5` / CSS / XPath baked in as the method.
- A script of writes that should still go through reversibility and `act`.
- Personal quirks (this user’s saved searches, this account’s language). D28: those stay per-account.
- Secrets, cookies, dummy-account passwords. The skill is the *map*, not the *keys*.

If the skill is a recording, it is already obsolete. If it is a short, versioned correction the model does not already know, it matches D26.

## Obsolescence (the part that makes this honest)

A shared skill without a way to die is a malware vector for the next session.

Three signals, not one:

1. **Prediction error (D25).** The skill said search is in the left rail; the rail has no Search, or Search opened Explore. That is a failed prediction. Stop trusting this version. Do not keep clicking because the skill is “approved.”
2. **Local obsolete list.** This machine (or this company) records `skill-id@version` as obsolete after (1), or after a human marks it. We do not wait for the publisher. Local truth beats a stale remote “latest.”
3. **New version → try once.** When `vN+1` appears, it is a *candidate*, not a restoration of trust. One bounded trial. If it predicts well, it becomes current. If not, it joins the obsolete list. No automatic rollback to vN.

Obsolete is not deleted. We want the history (“v3 lied about the composer”) so we do not re-learn a known-bad map.

A clock (“unused for 30 days”) is the wrong decay. Instagram can sit unchanged for months and then move Search in a week.

## Sharing and the fourth trust tier

D28’s tiers are session → account → curated repo-file. This idea adds a fourth: **community or company catalogue**.

That tier is the product. It is also the danger.

| Audience | Why it is strong | Why it is dangerous |
| --- | --- | --- |
| This operator, this profile | Highest precision. Matches D28 “earned.” | Does not cut cold start for anyone else. |
| Company, dummy-account trained | Best commercial fit. Controlled app, controlled accounts, controlled publisher. Skill is an onboarding artifact. | Still rot when the internal app ships. Obsolete list is per environment (staging vs prod). |
| Public / community | Everyone pays the Instagram tax once. | Poisoning, TOS (D33), PII in traces, incentive to over-claim. |

The company dummy-account story is the one that should lead. Public sharing of “how to automate Instagram” is a policy question, not a feature checkbox.

Authoring for the company case is a **distillation pass**, not a dump of `events.jsonl`. A human (or a later model with a tight rubric) writes the skill from successful traces. Auto-extracting selectors from one lucky run is how we get D25’s dangerous cache.

## Failure modes we already named

**Premature persistence (D26).** We do not yet have a corpus of corrections the model does not know. Until AGENT-07-T02 measures repeat rate, we do not know if cold start is “Instagram is uniquely weird” or “every host needs a pack.” Building the database first inverts the evidence.

**Context tax (D29).** A skill that is always inlined can cost more tokens than the probing it saves. Retrieval must stay lazy: catalogue line in context, body on demand, and only for the *current host + intent*. A 2k-token Instagram essay on a settings page is a regression.

**Wrong-but-clickable (D25).** The worst skill is not “file not found.” It is “click the control that still exists and is now Delete.” Harness checks do not save you if the ref is valid and the label drifted. Skills propose; the snapshot is the authority.

**Personalization leak.** “This user always posts as the brand account” is not a site skill. If we share it, we share the wrong default to the next person.

**Version races.** Two publishers update v4 with different maps. Without identity `(host, intent, publisher, version)` the obsolete list cannot name what it is refusing.

**Training with dummy accounts ≠ production identity.** The skill may be valid on the dummy tenant and wrong on the real one (feature flags, role, locale). Obsolete-by-environment, not only obsolete-by-host.

## What would have to be true for this to be an epic

Not “we like the story.” All of:

1. **Evidence** — AGENT-07-T02 (or an equivalent) shows a high enough archetype repeat rate, *or* we already hold a small set of corrections the model demonstrably does not know (D26). Cold-start turns with vs without a hand-written skill, same model, same task.
2. **Shape** — skill-as-data is specified: identity, intent key, version, body rules (guidance not scripts), publisher, environment.
3. **Load path** — lazy, host-scoped, does not blow the card (D29). Reuses `src/runtime/skills.ts` rather than a second catalogue if that still fits.
4. **Obsolescence** — prediction-error hook, local obsolete store, try-once on new version. Skills never authorize writes (D17, D23, D25).
5. **Share protocol** — at least company-local (files in a repo, or an internal registry). Public sharing is an explicit later decision under D33.
6. **Authoring** — who writes v1 (human distillation vs auto from traces) and how a conflict between two skills for the same host+intent is resolved.
7. **Measurement after ship** — skill hit rate, prediction-error rate, turns saved, and “skill caused a committing miss.” If the last one is non-zero, the skill is a liability.

Until then this stays an idea.

## Open questions

- Identity: is the key `host + intent` (e.g. `instagram.com` + `search-people`), or finer (`host + path pattern + intent`)?
- Intent vocabulary: planner-emitted (D26) or a closed enum? Closed enums rot; free text does not retrieve.
- Does the local obsolete list sync, or is it strictly per machine / per company env?
- When two skills match, do we pick publisher trust, recency, or ask the user (D8)?
- Is a failed probe during *training* allowed to write a negative skill (“this is not people search”) without a successful run? Negative knowledge is often the whole value.
- How do we keep dummy-account traces out of the skill body (no user ids, no URLs with tokens)?
- Does “try the new version” need a user-visible flag on a committing path, or is a single bounded read-only probe enough?

## Discussion notes

### 2026-09-05 — capture

The cold-start tax is real and we have watched it: Instagram search, parked Search after a reversibility mismatch, landmark chrome that does not exist on that host. The instinct to save the lesson is correct.

The instinct to build a **database** now is the same move D26 already rejected, plus a distribution problem D28 and D33 have not answered. The company dummy-account frame is the strongest reason to keep discussing rather than shelve. The public “everyone’s Instagram skill” frame is the weakest.

Implementation hook if this ever promotes: `loadSkillCatalogue` already treats a non-`generic` group directory as `host`. That is a seam, not permission to fill `skills/instagram/` this week.

Next useful move is not a schema. It is (a) finish the memory instrumentation so we know whether site-level repeat exists, and (b) if someone hand-writes **one** skill from a real failed session, treat it as an experiment: same task with/without the file, measure turns and misses. That experiment can live in this folder as evidence without becoming an epic.
