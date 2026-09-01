# V1-05-T02: Read-back for type and select

Status: planned  
Story: V1-05  
Depends: V1-05-T01

## Spec

`type` / `select` accept only when control read-back matches. A no-op or mismatched fill is rejected. Navigate accepts when the URL matches the target intent (redirects that keep host/path intent are allowed).

## Possible

Fixture `/apply` inputs and native `<select>`. For mismatch, type then assert against a different expected value, or use a control that ignores input.

## Do

- Default type/select postcondition: read-back equals sent text/value
- Default navigate postcondition: URL includes the intent
- Reject when read-back differs

## Tests

`tests/e2e/v1-05-readback.test.ts`

- Type matching value → accepted; observation value matches
- Type/select that does not stick → rejected
- Navigate to fixture path → accepted; wrong-host expect fails

## Done when

Fill and navigate are accepted only on read-back / URL, not on Playwright “did not throw.”
