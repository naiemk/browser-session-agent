#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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
import {
  defaultParentSessionDir,
  ParentSessionError,
  printParentHandle,
  resumeParentSession,
  startParentSession,
  takeParentFlags,
  withSessionDirArgs,
} from "../../host/parent-session.ts";
import { admitParentPlan, writeAdmittedPlan } from "../../host/parent-plan.ts";
import { runProfilesCommand } from "../../host/parent-profiles.ts";

const root = repoRootFrom(import.meta.url);
const raw = process.argv.slice(2);

if (raw.includes("--help") || raw.includes("-h") || raw[0] === "help") {
  process.stdout.write(helpText());
  process.exit(0);
}

/** Named cost profiles — no Chrome, no provider call. */
if (raw[0] === "profiles" || raw[0] === "--apply") {
  const argv = raw[0] === "profiles" ? raw.slice(1) : raw;
  const result = await runProfilesCommand(argv);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.code);
}

const withoutCheck = raw.filter((arg) => arg !== "--check");
const parent = takeParentFlags(withoutCheck);
const { args: extra, headless, browser } = takeLaunchFlags(parent.rest);

if (raw.includes("--check")) {
  const items = await collectChecks(root, { browser });
  process.stdout.write(`${formatChecks(items)}\n`);
  process.exit(checksFailed(items) ? 1 : 0);
}

/**
 * Magpie parent compact yield (`--json`): no Chrome, no provider.
 * Creates or resumes a Pi session under Magpie home and prints one JSON handle.
 */
if (parent.json) {
  try {
    const sessionDir = parent.sessionDir ?? defaultParentSessionDir();
    if (parent.session) {
      const handle = await resumeParentSession({
        session: parent.session,
        sessionDir,
      });
      process.stdout.write(`${printParentHandle(handle)}\n`);
      process.exit(0);
    }

    const planText = parent.planFile
      ? await readFile(parent.planFile, "utf8").catch(() => {
          throw new ParentSessionError(`plan file not found: ${parent.planFile}`);
        })
      : undefined;
    const objective = extractObjective(extra, planText);
    const admitted = admitParentPlan({ objective, planText });
    const handle = await startParentSession({
      sessionDir,
      name: parent.name,
      state: admitted.state === "blocked" ? "blocked" : admitted.state === "admitted" ? "admitted" : "ready",
      nextCheckHint:
        admitted.state === "blocked"
          ? "supply success criteria, then magpie --json --session <id>"
          : "magpie --session <id> -p \"status\"",
    });
    if (admitted.state !== "blocked") {
      await writeAdmittedPlan(handle.goal_id, admitted);
    }
    process.stdout.write(`${printParentHandle(handle)}\n`);
    process.exit(admitted.state === "blocked" ? 2 : 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(err instanceof ParentSessionError ? 1 : 1);
  }
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

let piExtra = extra;
if (parent.session || parent.sessionDir) {
  const sessionDir = parent.sessionDir ?? defaultParentSessionDir();
  if (parent.session) {
    try {
      await resumeParentSession({ session: parent.session, sessionDir });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    }
    piExtra = withSessionDirArgs(["--session", parent.session, ...piExtra], sessionDir);
  } else {
    piExtra = withSessionDirArgs(piExtra, sessionDir);
  }
}

const child = spawn(process.execPath, [pi, ...buildPiArgs(extension, piExtra)], {
  stdio: "inherit",
  env,
  cwd: process.cwd(),
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

function extractObjective(args: string[], planText?: string): string {
  const fromPlan = planText?.match(/^##\s*Goal\s*\n+([^\n#]+)/im)?.[1]?.trim();
  const positional = args
    .filter((arg) => !arg.startsWith("-") && !arg.startsWith("@"))
    .filter((arg) => arg !== "status");
  // Drop flag values that takeLaunchFlags already consumed conceptually; keep last prompt-like string.
  const prompt = positional[positional.length - 1];
  return (prompt ?? fromPlan ?? "").trim();
}
