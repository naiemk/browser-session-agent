# MVP-E2E-T01: Prompt-driven JSONLint E2E

Status: done  
Story: MVP-01 / MVP-03

## Spec

A single natural-language prompt creates unformatted JSON, opens JSONLint, validates, prettifies, and copies the formatted JSON back. CI runs this end-to-end through the same inspect/act tools Pi uses.

## Possible

The operator does not need a hosted LLM in CI. It interprets the prompt (URL, JSON payload, validate/prettify/copy intents) and then only calls `browser_inspect` / `browser_type` / `browser_click`. The CI site is a local JSONLint fixture with the same visible controls as the product path. Live `https://jsonlint.com/` is an optional dry-run (`npm run e2e:jsonlint -- --live`).

## Do

- Local `/jsonlint` fixture: JSON editor, Validate JSON, Prettify, `Valid JSON` alert
- `runBrowserPrompt(prompt)` as the E2E entry
- GitHub Actions job: `npm ci`, Playwright Chromium, `npm test` (includes `tests/e2e`)

## Tests

Prompt-only E2E: no hardcoded refs in the test. Assert copied text is pretty-printed and deep-equal to the source object.

## Done when

`npm test` in CI fails if the prompt operator cannot prettify JSON through the browser tools.
