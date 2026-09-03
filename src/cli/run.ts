#!/usr/bin/env node
/** Executable wrapper. `main` lives next door so tests can import it without running it. */

import { main } from "./main.ts";

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
