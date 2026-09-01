# V1-03-T01: Start and inspect

Status: done  
Story: V1-03  
Depends: V1-02-T01

## Spec

A signed-in, paid, paired user starts a run from chat. `browser_inspect` returns URL, title, and refs from the helper’s tab on a local fixture. The API process does not launch Chromium.

## Possible

Reuse `BrowserSession` over RPC. Fixture server from `tests/helpers/fixture-server.ts`. Until V1-08 lands, start-run is allowed for any session; after V1-08, this test marks the account paid in setup. Assert API has no Playwright browser context.

## Do

- Chat command or tool `/browser-start` with fixture URL
- Inspect RPC to the paired node
- Observation JSON in the tool result

## Tests

`tests/e2e/v1-03-inspect.test.ts`

- Register → pair → mark-paid → start run on `/apply`
- Inspect includes URL containing `/apply`, a title, and at least one named control ref
- API child was started without Playwright browsers (or `chromium` launch count on API is 0)

## Done when

Inspect data in chat comes from the helper, not from a VPS browser.
