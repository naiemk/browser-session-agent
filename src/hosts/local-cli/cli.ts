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
  takeHeadless,
} from "./launch.ts";

const root = repoRootFrom(import.meta.url);
const raw = process.argv.slice(2);

if (raw.includes("--help") || raw.includes("-h") || raw[0] === "help") {
  process.stdout.write(helpText());
  process.exit(0);
}

if (raw.includes("--check")) {
  const items = await collectChecks(root);
  process.stdout.write(`${formatChecks(items)}\n`);
  process.exit(checksFailed(items) ? 1 : 0);
}

const { args: extra, headless } = takeHeadless(raw);
const extension = extensionPath(root);
const pi = piEntryPath(root);
const items = await collectChecks(root);
const blocking = items.filter((item) => item.required && !item.ok && item.name !== "chromium");
if (blocking.length > 0) {
  process.stderr.write(`${formatChecks(items)}\n`);
  process.exit(1);
}
if (items.find((item) => item.name === "chromium" && !item.ok)) {
  process.stderr.write("Playwright Chromium is not installed.\n");
  process.stderr.write("  npx playwright install chromium\n");
  process.exit(1);
}

process.stderr.write("browser-session-agent local CLI — Chromium on this machine, no VPS.\n");
process.stderr.write("In Pi: /login (once), then /browser-start <goal>\n");

const env = { ...process.env };
if (headless) env.BSA_HEADLESS = "1";

const child = spawn(process.execPath, [pi, ...buildPiArgs(extension, extra)], {
  stdio: "inherit",
  env,
  cwd: process.cwd(),
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
