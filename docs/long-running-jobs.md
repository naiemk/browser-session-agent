# Long-running jobs

Local-first durable work that can span days or weeks. A job is created explicitly; an ordinary Pi conversation never becomes one. Hosted web/RPC, notifications, multi-profile fan-out, and a resident daemon are out of scope for this release.

Pi supplies the model loop, TUI, tools, and bounded task runtime. Durable state, safety rules, and scheduling live in TypeScript. Session transcripts are a cache. Disk is the source of truth.

## Layout

Jobs reuse the goal directory (`~/.browser-agent-core/goals/<jobId>/`). A `job.json` marker distinguishes a job from a one-shot goal. Existing goals and legacy `RunState` runs are not migrated.

```
goals/<jobId>/
  job.json                 # identity, title, durable status, spec/sprint pointers
  specs/<n>.json|.md       # versioned spec; JSON is canonical
  plan.json                # living task graph (PlanStore)
  tasks/<id>.json          # immutable oracle criteria (TaskStore)
  entities/<id>.json       # per-entity park, journal, facts
  sprints/<id>.json|.md    # current sprint is the only one loaded on resume
  human/<id>.json          # human-attention inbox
  scheduler.json           # cooldowns, circuit breakers, grant usage, spend
  events.jsonl             # append-only evidence
  .locks/job/              # per-job mutation lease
  artifacts/ scratch/ checkpoint-*.json
.locks/browser/            # one global browser lease under the core root
```

## Durable vs display status

Durable: `planning`, `awaiting_plan_approval`, `active`, `paused`, `completed`, `cancelled`, `failed`.

Derived for humans: `running` (lease held), `idle` (active, nothing due), `waiting_human` (inbox open).

Crashes cannot leave a durable `running` state.

## Commands

Pi: `/jobs`, `/job-new`, `/job-use`, `/job-title`, `/job-status`, `/job-plan`, `/job-approve-plan`, `/job-run`, `/job-inbox`, `/job-human`, `/job-pause`, `/job-resume`, `/job-revise`, `/job-rollover`.

CLI: `browser-agent jobs` and `browser-agent job create|show|title|approve-plan|pause|resume|tick|run`.

`job tick --due` is the calendar-time entry point. Invoke it by hand or from cron/launchd. This package does not install a scheduler.

## Invariants

1. No attempt starts without an approved hashed spec and a current sprint pinned to it.
2. Title is display metadata. Identity is the job id.
3. Approved spec bytes never change. `/job-revise` drafts version N+1 and pauses new work until that hash is approved.
4. Task criteria are immutable. Discoveries instantiate an approved template.
5. Parking one entity never blocks unrelated ready work.
6. Consequential actions journal prepare → fired → verified. Resume reconciles live criteria before retrying.
7. Approval grants match spec hash, host, authorization class, optional control, expiry, and remaining count. Destructive, payment, credential, OTP, and CAPTCHA work are never blanket-preapproved.
8. Agent retry recommendations are clamped by policy. Cooldowns and circuit breakers are shared per host/account resource.
9. A fresh process continues from spec + current sprint + stores + ledger. Archived sprints and Pi transcripts are optional.
10. Secrets are references. Payloads are redacted and capped.

## Skills

Lifecycle skills are pinned by job phase (`job-planner`, `job-sprint`, `job-human`). The local CLI still launches with `--no-skills`; the extension injects the exact skill body. Semantic catalogue retrieval is not used for required lifecycle behaviour.

## Testing

CI is token-free: mock model, real browser fixtures, injected clock. Live Pi login and the persistent profile are a manual smoke only. No production CAPTCHA solving and no live external commits in automated tests.

## Operations

Jobs are directories. Backup or restore one with a copy of `goals/<jobId>/`. The rest of the core root can stay put. Do not edit `job.json`, an approved `specs/<n>.json`, or `events.jsonl` by hand; use `/job-revise` or `browser-agent job` when the spec must change.

There is no daemon. Calendar time is `browser-agent job tick --due`, by hand or from cron/launchd:

```
*/20 * * * * browser-agent job tick --due --root ~/.browser-agent-core
```

`tick` is one attempt. `job run` keeps ticking until idle, paused, waiting on a human, or the tick cap. Headless ticks cannot take over a live CAPTCHA or OTP; those stay in the inbox until a headed `/job-human` session. Never put a CAPTCHA solver on the agent.

Optional live smoke, not CI: create a job against a local harmless page (`/job-new` or `browser-agent job create`), grill and approve the hashed spec, then `job tick` until idle. Confirm the job still lists after a new process. Do not target production sites, payments, or credentials.
