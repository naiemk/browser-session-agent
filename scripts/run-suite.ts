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

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FixtureServer } from "../tests/helpers/fixture-server.ts";
import { formatReport, runSuite } from "../src/suite/runner.ts";
import { ReferenceDriver } from "../src/suite/reference-driver.ts";
import { SuiteAgentDriver } from "../src/suite/agent-driver.ts";
import { createPiSessionFactory } from "../src/agent/pi-session.ts";
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

async function driverFor(target: string): Promise<AgentDriver> {
  switch (target) {
    case "reference":
      return new ReferenceDriver();
    case "agent": {
      const root = arg("root") ?? (await mkdtemp(path.join(os.tmpdir(), "suite-agent-")));
      process.stderr.write(`agent evidence: ${root}\n`);
      return new SuiteAgentDriver({
        root,
        createSession: createPiSessionFactory({
          thinkingLevel: (arg("thinking") as "low") ?? "low",
          maxOutputTokens: 4096,
          model: arg("model"),
        }),
        // Fixtures are disposable, so the suite commits without pausing for a human.
        policy: "auto",
        answers: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          password: "hunter2",
        },
      });
    }
    default:
      throw new Error(`Unknown target "${target}". Available: reference, agent.`);
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
    driver: await driverFor(target),
    origin,
    headless: !flag("headed"),
    only,
    pauseMs: target === "reference" ? 0 : Number(arg("pause") ?? 2000),
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
