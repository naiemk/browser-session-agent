# The agent runtime

How a goal becomes verified browser work, and how all of it is tested without paying for
tokens.

## Layers

```
CLI (src/cli)  ──────────────┐
                             ├──► AgentRuntime (src/runtime) ──► Core (src/core) ──► Playwright
Suite (src/suite) ───────────┘            │
                                          └──► ModelPort: live provider | mock
```

- **`src/core`** owns the browser and the truth: perception, one verified action path, the
  read-only probe, code-only predicates, reversibility judgement, the commit gate, the
  evidence ledger, entity state, the task graph, the evaluator. It imports nothing but
  node builtins and Playwright, and a test enforces that.
- **`src/runtime`** owns one bounded task: the task card, the tools, context pruning, the
  turn budget, and the loop. It is the only place that knows about Pi.
- **`src/suite`** owns measurement: tasks with external criteria, three targets, and a
  runner that decides outcomes itself.
- **`src/cli`** is the front door. No socket, no pairing, no background service.

## Knowing where you stand

A coding agent can read its whole world: `pwd`, `git remote`, the config file. A browser
agent is handed a viewport and must work out the rest — whose account this is, what the
session grants, whether a page is reachable by anyone. Those answers decide what "my
followers" refers to and where to look for it, and they differ per site and per session.

There is one primitive for all of it. `openIsolatedTab` loads a URL in a fresh Playwright
context with no cookies and no storage, and `viewWithoutSession` compares that with the
same URL as us. A redirect to a login wall says the content is behind the session; an
identical page says the session was not what made it visible; a shorter control list names
what the session grants. The comparison is read-only by construction, since a context with
no credentials cannot change the user's account, and the isolated tab is always closed so a
comparison cannot quietly become a second session.

`compareObservations` returns differences, never a verdict. There is no `isPublic`, because
"public" is a conclusion and the evidence underdetermines it: A/B tests, geography, and
consent walls also change an anonymous view. The card tells the model that.

What the agent works out, it keeps. `remember` writes a free-form key and value onto the
goal, along with the ledger event that established it, so the reasoning behind a claim
about the situation stays auditable and a later task does not repeat the investigation.
Session-free views are budgeted like any other exploration, because each one is a real
anonymous request to somebody's site.

## When the model says no

A model that answers in prose and calls no tools is otherwise indistinguishable from a task
where nothing happened. `RunOutcome.declined` names it, and the evaluator turns a
persistent decline into `needs_user_input` so the human is told plainly rather than left to
argue with a chatbot. `runTaskWithDeclineRetry` gives exactly one more attempt, and only
when there are established facts to attach: sometimes the agent declined because it could
not tell where it stood. If the answer does not change, it stands.

## Why it builds on `pi-agent-core` rather than `createAgentSession`

Two reasons, both load-bearing.

`createAgentSession` hardcodes its stream function: it always calls `streamSimple` with a
real API key. There is no seam, so every test of the agent loop would cost money and vary
run to run. `pi-agent-core`'s `Agent` takes `streamFn` as a first-class option.

It also brings a resource loader, session files on disk, a settings manager, and auth —
none of which a bounded browser task needs. What is left after dropping them is small
enough to read in one sitting.

Pi's loop itself is untouched. Tool execution, errors-as-text, truncation, and queueing
behave exactly as they do in production, whichever model port is plugged in.

## The model port

```ts
type ModelPort = (model, context, options) => AssistantMessageEventStream;
```

Two implementations:

- **live** (`createLiveModel`) resolves a key from the environment, picks a model by
  preference order, and delegates to `streamSimple`. Nothing in this path is imported
  during a mock run, so a test cannot accidentally reach a provider.
- **mock** (`createMockModel`) emits the same event protocol — `start`, content blocks,
  `done` — from a local script. It honours abort signals, reports usage, and can emit a
  provider-style failure on purpose.

The mock has two modes:

- `plan`: intended tool calls with targets named rather than ref'd. Refs are resolved at
  call time from the newest observation in the transcript, which is what a real agent has
  to do, so that path is exercised too.
- `script`: raw turns, for reproducing awkward behaviour deliberately — a model that
  claims success without acting, one that repeats a failing click, one that errors.

## Turn budget

Pi's engine has no step limit. Aborting from a `turn_end` listener only signals the
provider, and a stream that ignores the signal keeps the loop running — which is exactly
what happened the first time. The budget is therefore enforced at the model port: once it
is spent, the port returns a turn with no tool calls and the loop ends because the model
stopped asking for tools. That costs nothing, since the capped turn never reaches a
provider.

## Suite targets

| Target | Model | Cost | What it proves |
| --- | --- | --- | --- |
| `reference` | none | free | the tasks are solvable and their criteria are reachable |
| `mock` | local | free | tools, harness, gate, pruning, criteria, and the loop all work |
| `live` | provider | paid | whether the agent is actually competent |

`reference` and `mock` run on every push. `live` runs by hand from the Live baseline
workflow. The distinction that matters: the first two catch plumbing regressions, and
only the third measures competence.

## Token discipline

A browser agent's cost is dominated by page snapshots, which are resent every turn.

- Observations are trimmed before they reach the model: only the fields a decision needs,
  flags present only when true, empty values dropped rather than sent as null, long labels
  clipped, the control list capped with a note saying how many were withheld.
- JSON goes out without indentation, because indentation is billed.
- Superseded snapshots are replaced with a placeholder. The message stays, because
  providers require every tool call to keep a matching result.
- The task card is short by design; it is resent on every turn.
- The live suite defaults to a small subset covering distinct failure modes.
- Every run reports tokens and cost per task, so a change that improves success while
  tripling spend is visible rather than celebrated.

## CLI

```bash
# One goal against a real site, with an explicit success criterion.
npm run agent -- run "apply for the staff engineer role" \
  --url https://example.test/jobs \
  --criterion "text_visible:Application submitted" \
  --policy ask

# Token-free regression run.
npm run suite

# Paid competence check on a small subset.
npm run suite:live

# Read back what happened.
npm run agent -- replay goal_abc123
```

`run` exits 0 only when the criteria pass, so it composes in a shell. Irreversible
actions default to needing approval; the CLI declines them and explains how to allow them,
which means an unattended run cannot submit something by surprise.
