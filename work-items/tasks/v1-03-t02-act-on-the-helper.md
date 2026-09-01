# V1-03-T02: Act on the helper

Status: done  
Story: V1-03  
Depends: V1-03-T01

## Spec

Type or click a fixture control through chat tools. The next observation shows the mutation.

## Possible

Same stack as T01. Use `/apply` or `/login` named fields. Prefer acting by ref from the inspect result (test may read refs from the tool payload; the product path still forbids CSS).

## Do

- `browser_type` / `browser_click` over RPC
- Return a fresh observation from the helper

## Tests

`tests/e2e/v1-03-act.test.ts`

- Inspect `/login` or `/apply`
- Type a visible field
- Next inspect/act observation shows the new value
- Click a button that changes the page; URL or controls change

## Done when

A chat tool call mutates the helper’s Chromium and the observation proves it.
