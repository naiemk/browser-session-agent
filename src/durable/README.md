# Durable jobs / campaigns (Jobs V2)

Normative: [`docs/jobs-v2-spec.md`](../../docs/jobs-v2-spec.md).

Layers:

- `domain/` — pure types and reducers (no Pi, Playwright, CLI, SQLite, Fabric, or `node:fs`)
- `application/` — command shapes and derived display status helpers
- `ports/` — interfaces (later tickets)
- `infrastructure/sqlite/` — store (later)
- `adapters/` — Pi/CLI/web (later)
