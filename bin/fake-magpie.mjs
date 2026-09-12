#!/usr/bin/env node
/**
 * PATH shim for R6.E2. State dir: FAKE_MAGPIE_STATE (required).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const loader = path.join(root, "bin", "tsx-loader.mjs");
const entry = path.join(root, "tests", "helpers", "fake-magpie-cli.ts");

const child = spawn(process.execPath, ["--import", loader, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
