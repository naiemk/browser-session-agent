# MVP-06-T01: Candidate knowledge and safe reuse

Status: planned  
Story: MVP-06  
Depends: MVP-04-T01

## Spec

Knowledge records point at source evidence and outcomes. User facts need explicit approval. Later runs can retrieve approved knowledge.

## Possible

JSONL is enough for MVP volume. Retrieval is token overlap (goal + URL + title vs record text/tags). No model-written code changes, no silent system-prompt rewrite beyond injecting retrieved records as a tool result.

## Do

- `KnowledgeStore.propose | approve | reject | search`
- Kinds: `user_fact`, `strategy`
- `browser_knowledge_propose`, `browser_knowledge_search`, `/browser-approve`, `/browser-knowledge`
- Search default: approved facts + strategies from successful runs
- Inject search results only when the tool is called, not as hidden prompt mutation

## Tests

- Unapproved fact is invisible to search
- After approve, search by a keyword in the fact returns it with source run id
- Strategy from a `failed` run is not returned; from `completed` is returned
- Record JSON includes `evidenceEventIds`

## Done when

Reuse is an explicit retrieve of approved records, never an opaque self-edit.
