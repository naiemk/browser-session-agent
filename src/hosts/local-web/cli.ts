#!/usr/bin/env node
import {
  checksFailed,
  formatChecks,
  repoRootFrom,
} from "../local-cli/launch.ts";
import {
  collectWebChecks,
  formatReady,
  helpText,
  startLocalWeb,
  takeLocalWebArgs,
} from "./launch.ts";

const root = repoRootFrom(import.meta.url);
const raw = process.argv.slice(2);

if (raw.includes("--help") || raw.includes("-h") || raw[0] === "help") {
  process.stdout.write(helpText());
  process.exit(0);
}

if (raw.includes("--check")) {
  const items = await collectWebChecks(root);
  process.stdout.write(`${formatChecks(items)}\n`);
  process.exit(checksFailed(items) ? 1 : 0);
}

const parsed = takeLocalWebArgs(raw);
const items = await collectWebChecks(root);
if (items.find((item) => item.name === "chromium" && !item.ok)) {
  process.stderr.write("Playwright Chromium is not installed.\n");
  process.stderr.write("  npx playwright install chromium\n");
  process.exit(1);
}

const web = await startLocalWeb({
  host: parsed.host,
  port: parsed.port,
  token: parsed.token,
  home: process.env.BSA_HOME,
  headless: parsed.headless,
});

process.stderr.write(formatReady({
  host: parsed.host,
  port: web.api.port,
  token: web.token,
  headless: parsed.headless,
}));

const shutdown = async () => {
  await web.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
