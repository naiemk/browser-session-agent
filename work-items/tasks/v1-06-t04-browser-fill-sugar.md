# V1-06-T04: browser_fill sugar

Status: planned  
Story: V1-06  
Depends: V1-06-T03, V1-05-T02

## Spec

One tool fills a form (fields + optional submit). Each field is harness-checked. This is a page plan with one attempt per field and no branches.

## Possible

`browser_fill { fields: [{ ref | label, text }], submit?, expect }`. Internally compile to a `PagePlan` or loop `act(type)` with required read-back.

## Do

- Tool schema and RPC
- Stop on first rejected field; return which field failed
- Optional submit click after all fields accept

## Tests

`tests/e2e/v1-06-fill.test.ts`

- `/login` or `/apply`: one `browser_fill` sets multiple fields; observation matches
- One bad field → that field rejected; later fields not applied
- Optional submit: URL or banner changes only if every field accepted

## Done when

A login/apply form is one tool call, still harness-honest.
