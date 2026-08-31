# MVP-01-T01: Pi package scaffold

Status: in_progress  
Story: MVP-01

## Spec

Turn this repo into an installable Pi package with a TypeScript extension entry, shared domain types, and a test harness. No browser yet.

## Possible

Pi discovers `package.json` `pi.extensions` (or conventional `extensions/`). TypeScript is loaded with jiti. Vitest can unit-test Pi-free modules; the extension is tested with a fake `ExtensionAPI`.

## Do

- `package.json` with `pi-package` keyword, `pi.extensions: ["./src/extension.ts"]`
- `src/domain/types.ts` for runs, tabs, events, attention items
- `src/pi-api.ts` minimal structural types so we compile without Pi at test time
- Extension registers a stub `/browser-status` and reports “worker not started”

## Tests

- Package manifest includes `pi.extensions` and `pi-package`
- Extension function registers at least `/browser-status` on the fake API

## Done when

`npm test` runs, and the extension loads against the fake API.
