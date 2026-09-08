# Live-run review template

Copy this file into the evidence log or fill a new section using the same headings after
every live run. Record facts before interpreting them.

## Identity

- Date:
- Reviewer:
- Goal id:
- Job id, if this was a durable job:
- Commit:
- Branch:
- Host: local Pi / hosted Pi / CLI job tick / other
- Start and end time:
- Exact operator request:
- Operator clarifications:
- Intended top-level deliverable:
- Expected cardinality:
- External quality threshold:
- Consequential actions allowed:

## Model timeline

List every model interval. Do not trust the aggregate `run.model` field until PERF-01 is
fixed.

- Timestamp — provider/model — phase — reason for switch:
- Timestamp — provider/model — phase — reason for switch:

Sources:

- Pi session `model_change` entries.
- Assistant message `provider` and `model` fields.
- `metrics.jsonl` for aggregate usage and cost.

## Outcome

- Reported final status:
- Oracle status:
- Did those statuses agree?
- Requested count:
- Delivered count:
- Human-accepted count:
- Strict-quality count:
- Partial artifacts delivered:
- Missing requirements:
- Human interruptions:
- External commits performed:

## Result-quality sample

Choose a random or mechanically selected sample before reading the agent's rationale.
Include top-ranked, middle-ranked, and low-ranked outputs.

For each sampled item:

- Entity id or handle:
- Human verdict: strong fit / weak fit / wrong audience / insufficient evidence
- Directly observed facts:
- Inferred claims:
- Evidence references:
- Relevance score:
- Recency score:
- Confidence:
- Personalization grounded: yes / no
- Required correction:

Aggregate:

- Sample size:
- Strong fits:
- Weak fits:
- Wrong audience:
- Insufficient evidence:
- Human precision:
- Unsupported claims:
- Personalization edits required:

## Artifact consistency

List every canonical or generated artifact:

- Path:
- Claimed source version/hash:
- Entity count:
- Entity ids:
- Generated or hand-maintained:

Checks:

- Counts agree:
- Entity ids agree:
- Removed entities absent everywhere:
- Report status agrees with artifacts:
- Placeholder values remaining:
- Links usable:
- Interactive controls have real persistence:
- Build reproducible from canonical input:

## Browser-loop metrics

Run:

```sh
browser-agent metrics <goal-id> --root ~/.browser-agent-core --json
```

Record:

- Turns:
- Wall time:
- Successful actions:
- Failed actions:
- `act` calls:
- `probe` calls:
- `observe` calls:
- `peek` calls:
- Other tools:
- `act` `ok:true` / `ok:false` / refused / tool error:
- Inspected entities:
- Accepted entities:
- Turns per inspected entity:
- Turns per accepted entity:
- Browser calls per accepted entity:
- Action failure rate:
- Observations with collisions:
- Maximum collisions:

Describe the dominant repeated loop:

1.
2.
3.

For each repeated step, mark:

- Requires model judgment:
- Could be deterministic:
- Could be combined with the previous browser operation:
- Could run as a bounded read-only recipe:

## Token, context, and dollar cost

- Fresh input tokens:
- Output tokens:
- Cache-read tokens:
- Cache-write tokens:
- Cache-read share:
- Total recorded cost:
- Cost per inspected entity:
- Cost per delivered entity:
- Cost per human-accepted entity:
- Mean context bytes:
- Peak context bytes:
- Final live bytes:
- Final placeholder bytes:
- Tool-schema attribution:
- Agent-card attribution:
- Action-result attribution:
- Probe-result attribution:

Per model and phase, reconstructed from the session transcript until PERF-01 lands:

- Model:
- Phase:
- Turns:
- Fresh input:
- Output:
- Cache read:
- Cost:

## Failures and recoveries

For every distinct failure class:

- Failure:
- Count:
- First occurrence:
- Recovery:
- Repeated without new evidence:
- Result impact:
- Cost impact:
- Candidate product fix:

Explicitly check:

- Authentication or browser-profile lock:
- No-progress scroll:
- Truncated or ambiguous observation:
- Wrong-page success predicate:
- Platform challenge/rate limit:
- Distinct challenged hosts:
- Actions after first high-confidence challenge:
- Same-host challenge retries:
- Challenge takeover/park/resume result:
- Missing capability:
- Stale context or artifact:
- Model refusal:
- False completion:

## Approval interruptions

Do not infer these durations from adjacent ledger rows once explicit prompt timing exists.

For each prompt:

- Intent:
- Prompt created:
- Prompt resolved:
- Action finished:
- Wait duration:
- Classification rule and expected effect:
- Covered by explicit task intent:
- Human verdict: necessary / unnecessary / ambiguous
- Remembered grant reused:
- Grant identity included effect, destination, and workflow stage:

Aggregate:

- Prompts shown:
- Necessary prompts:
- Ask precision:
- Total prompt wait:
- Share of wall time:
- Cross-stage approval aliases:

## Quality-process trace

- Who defined the rubric?
- Was ambiguity shown to the operator?
- Did the rubric change during execution?
- Were rejected and uncertain records preserved?
- Did generation begin before qualification was stable?
- Was there an independent review?
- Did the reviewer have fresh context?
- Did corrections rebuild every projection?

## Findings

Separate observation from hypothesis.

Observed:

- 

Hypothesized causes:

- 

Evidence against the hypotheses:

- 

## Ticket updates

For each affected item in `docs/live-run-investigation-plan.md`:

- Ticket id:
- New evidence:
- Supports / contradicts / neutral:
- Suggested next status:
- Follow-up experiment:

## Decision

- No decision / accept / experiment / reject / defer:
- Scope:
- Evidence:
- Trade-off:
- Next run or implementation:

Append the result to `docs/live-run-evidence-log.md`. Accepted architectural decisions
also go in `docs/decisions.md`.
