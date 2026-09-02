#!/usr/bin/env node
/**
 * Suite runner CLI (D19).
 *
 *   npx tsx scripts/run-suite.ts --target reference
 *   npx tsx scripts/run-suite.ts --target reference --only apply-submit,login-happy
 *   npx tsx scripts/run-suite.ts --target reference --out results/baseline.json
 *
 * Exits non-zero only on a runner error. Task failures are data, not build breaks,
 * so a regression in agent competence is visible in the numbers rather than hidden
 * behind a red build.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FixtureServer } from "../tests/helpers/fixture-server.ts";
import { formatReport, runSuite } from "../src/suite/runner.ts";
import { ReferenceDriver } from "../src/suite/reference-driver.ts";
import { SUITE_TASKS } from "../src/suite/tasks.ts";
import type { AgentDriver } from "../src/suite/types.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function driverFor(target: string): AgentDriver {
  switch (target) {
    case "reference":
      return new ReferenceDriver();
    default:
      throw new Error(
        `Unknown target "${target}". Available: reference. ` +
          `Agent targets are added by AGENT-07-T01 (session strategy experiment).`,
      );
  }
}

const target = arg("target") ?? "reference";
const only = arg("only")?.split(",").map((id) => id.trim()).filter(Boolean);
const outPath = arg("out");

const server = new FixtureServer();
const origin = await server.start();

try {
  const report = await runSuite({
    tasks: SUITE_TASKS,
    driver: driverFor(target),
    origin,
    headless: !flag("headed"),
    only,
    onTask: (run) => {
      const mark = run.outcome === "passed" ? "ok" : run.outcome;
      process.stderr.write(`  ${mark.padEnd(6)} ${run.id} (${run.steps} steps)\n`);
      if (run.outcome !== "passed") process.stderr.write(`         ${run.detail}\n`);
    },
  });

  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stderr.write(`\nwrote ${outPath}\n`);
  }

  process.stdout.write(`${formatReport(report)}\n`);
} finally {
  await server.stop();
}
