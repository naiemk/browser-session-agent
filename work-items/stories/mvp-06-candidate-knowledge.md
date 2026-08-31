# MVP-06: Candidate Knowledge and Safe Reuse

Status: in_progress

As an operator, I can retain successful strategies and approved answers without opaque self-modification.

## Acceptance criteria

- Candidate knowledge records link to source run id, evidence event ids, and outcome.
- User facts remain unsearchable until `/browser-approve`.
- Later runs retrieve relevant approved facts and successful strategies only through `browser_knowledge_search` (no hidden code or prompt mutation).

## Decisions

See `docs/decisions.md` D8.

## Tasks

- [MVP-06-T01](../tasks/mvp-06-t01-candidate-knowledge.md)

## Tests

Approval gate, lexical search, failed-run strategies excluded. See `docs/test-design.md`.
