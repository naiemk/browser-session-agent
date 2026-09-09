# CAMPAIGN-00-T01: Quarantine misleading prototype behavior

Status: done
Spec: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md) — **MIGRATE-01**, **ADAPTER-02**  
Evaluation: [`docs/jobs-v2-evaluation.md`](../../docs/jobs-v2-evaluation.md)  
Evidence minimum: **L6** for CLI/Pi messaging; no new durable engine

## Goal

Make unsupported long-running prototype behavior fail loudly without expanding the
prototype architecture.

## Discovery

- Exercise every Pi/CLI job command for planning, ready, blocked, revised, terminal.
- Trace claims of idle / scheduled / running / resumed.
- Confirm `neverPreapprove` is not fully enforced at the gate (document only).
- Confirm `active-job` entry is write-only.

## Fix

- Return `runtime_unavailable` (or equivalent nonzero + clear text) when eligible work has
  no model/browser host — never call that idle.
- Label prototype commands experimental; remove cron claims until V2 host exists.
- Require explicit development flag for ephemeral `job run`; warn no persistent profile.
- Reject spec revision after work materialization.
- Do not advertise preapproval safety; outside development, do not authorize external
  effects via prototype grants.
- Remove or rename write-only active-job persistence as non-restorable evidence.
- Keep changes narrow — no new store or browser owner.

## Prohibited

- Refactoring `src/jobs` into V2
- Dual-write to SQLite
- Claiming CAPTCHA/challenge detection is fixed

## Tests / evidence

- CLI process: eligible work without host ≠ idle
- Pi: approved job not described as running/scheduled without host
- Revision after materialization rejected
- Ephemeral run requires flag

## Review focus

Honesty of operator messaging; no silent scheduling; no weakened safety.

## Depends on

None.

## Done when

Evaluation record complete; MIGRATE-01 and ADAPTER-02 covered; hard score gates met after
improvement pass.
