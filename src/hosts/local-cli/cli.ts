#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  buildPiArgs,
  checksFailed,
  collectChecks,
  extensionPath,
  formatChecks,
  helpText,
  piEntryPath,
  repoRootFrom,
  takeLaunchFlags,
} from "./launch.ts";

const root = repoRootFrom(import.meta.url);
const raw = process.argv.slice(2);

if (raw.includes("--help") || raw.includes("-h") || raw[0] === "help") {
  process.stdout.write(helpText());
  process.exit(0);
}

const { args: extra, headless, browser } = takeLaunchFlags(raw.filter((arg) => arg !== "--check"));

if (raw.includes("--check")) {
  const items = await collectChecks(root, { browser });
  process.stdout.write(`${formatChecks(items)}\n`);
  process.exit(checksFailed(items) ? 1 : 0);
}

const extension = extensionPath(root);
const pi = piEntryPath(root);
const items = await collectChecks(root, { browser });
const browserName = browser === "chrome" ? "chrome" : "chromium";
const blocking = items.filter((item) => item.required && !item.ok && item.name !== browserName);
if (blocking.length > 0) {
  process.stderr.write(`${formatChecks(items)}\n`);
  process.exit(1);
}
if (items.find((item) => item.name === browserName && !item.ok)) {
  if (browser === "chrome") {
    process.stderr.write("Google Chrome is not installed.\n");
    process.stderr.write("Install Chrome, or run with Playwright Chromium:\n");
    process.stderr.write("  npx playwright install chromium\n");
    process.stderr.write("  npm run cli -- --chromium\n");
  } else {
    process.stderr.write("Playwright Chromium is not installed.\n");
    process.stderr.write("  npx playwright install chromium\n");
  }
  process.exit(1);
}

const browserLabel = browser === "chrome" ? "Google Chrome" : "Playwright Chromium";
process.stderr.write(`magpie local CLI — ${browserLabel} on this machine, no VPS.\n`);
process.stderr.write("In Pi: /login (once), then /browser-start <goal>\n");

const env = { ...process.env };
if (headless) env.BSA_HEADLESS = "1";
env.BSA_BROWSER = browser;

const child = spawn(process.execPath, [pi, ...buildPiArgs(extension, extra)], {
  stdio: "inherit",
  env,
  cwd: process.cwd(),
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
