#!/usr/bin/env node
import { runFakeMagpie } from "./fake-magpie.ts";

const stateDir = process.env.FAKE_MAGPIE_STATE;
if (!stateDir) {
  process.stderr.write("FAKE_MAGPIE_STATE is required\n");
  process.exit(2);
}

const result = await runFakeMagpie(process.argv.slice(2), {
  stateDir,
  cwd: process.cwd(),
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.code);
