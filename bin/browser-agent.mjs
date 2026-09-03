#!/usr/bin/env node
// CLI entry point. Uses tsx so the TypeScript sources run directly, matching how the
// rest of the project is executed.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "../src/cli/run.ts");

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", entry, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
