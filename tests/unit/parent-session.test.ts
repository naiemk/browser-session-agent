import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  defaultParentSessionDir,
  printParentHandle,
  resumeParentSession,
  startParentSession,
  takeParentFlags,
  withSessionDirArgs,
  ParentSessionError,
} from "../../src/host/parent-session.ts";
import { MAGPIE_GOAL_ENTRY, restoreGoalId } from "../../src/host/pi-session-goal.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BIN = path.join(ROOT, "bin", "bsa-cli.mjs");
const homes: string[] = [];

afterEach(async () => {
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function tempRoot(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-parent-sess-"));
  homes.push(home);
  return home;
}

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe("PARENT-01-T01 parent session CLI", () => {
  it("defaults session-dir under Magpie core root, not cwd hash", async () => {
    const home = await tempRoot();
    const dir = defaultParentSessionDir(home);
    assert.equal(dir, path.join(home, "pi-sessions"));
    assert.equal(dir.includes(process.cwd()), false);
  });

  it("takeParentFlags pulls --json / --session / @plan.md and leaves -p for Pi", () => {
    const flags = takeParentFlags([
      "--json",
      "--name",
      "harvest",
      "@plan.md",
      "--session-dir",
      "/tmp/s",
      "-p",
      "status",
    ]);
    assert.equal(flags.json, true);
    assert.equal(flags.name, "harvest");
    assert.equal(flags.planFile, "plan.md");
    assert.equal(flags.sessionDir, "/tmp/s");
    assert.deepEqual(flags.rest, ["-p", "status"]);
  });

  it("startParentSession writes a Pi jsonl Magpie can restore", async () => {
    const home = await tempRoot();
    const sessionDir = path.join(home, "pi-sessions");
    const first = await startParentSession({ root: home, sessionDir, name: "canary" });
    assert.match(first.session_id, /^[A-Za-z0-9]/);
    assert.match(first.goal_id, /^goal_/);
    assert.equal(first.state, "ready");

    const body = await readFile(first.session_file, "utf8");
    assert.match(body, /"type":"session"/);
    assert.match(body, new RegExp(MAGPIE_GOAL_ENTRY));

    const second = await resumeParentSession({
      session: first.session_id,
      sessionDir,
      root: home,
    });
    assert.equal(second.goal_id, first.goal_id);
    assert.equal(second.session_id, first.session_id);

    const opened = SessionManager.open(first.session_file, sessionDir);
    assert.equal(restoreGoalId(opened.getEntries()), first.goal_id);
  });

  it("unknown --session throws ParentSessionError", async () => {
    const home = await tempRoot();
    await assert.rejects(
      () => resumeParentSession({ session: "does-not-exist", sessionDir: path.join(home, "pi-sessions") }),
      (err: unknown) => err instanceof ParentSessionError && /unknown session/.test(err.message),
    );
  });

  it("printParentHandle is one JSON object parsers can take as the last line", () => {
    const line = printParentHandle({
      session_id: "abc",
      goal_id: "goal_1",
      state: "ready",
      next_check_hint: "status",
      session_dir: "/tmp",
      session_file: "/tmp/x.jsonl",
    });
    assert.deepEqual(JSON.parse(line), {
      session_id: "abc",
      goal_id: "goal_1",
      state: "ready",
      next_check_hint: "status",
    });
  });

  it("withSessionDirArgs does not duplicate --session-dir", () => {
    assert.deepEqual(withSessionDirArgs(["-p", "x"], "/s"), ["--session-dir", "/s", "-p", "x"]);
    assert.deepEqual(withSessionDirArgs(["--session-dir", "/s", "-p", "x"], "/other"), [
      "--session-dir",
      "/s",
      "-p",
      "x",
    ]);
  });

  it("CLI --json start returns without Chrome and restores goal on --json --session", async () => {
    const home = await tempRoot();
    const sessionDir = path.join(home, "pi-sessions");
    const env = {
      ...process.env,
      BSA_CORE_HOME: home,
      HOME: home,
    };
    const started = await runCli(
      ["--json", "--session-dir", sessionDir, "--name", "parent-canary", "qualify ~50 founders"],
      env,
    );
    assert.equal(started.code, 0, started.stderr);
    const handle = JSON.parse(started.stdout.trim().split("\n").at(-1)!);
    assert.ok(handle.session_id);
    assert.match(handle.goal_id, /^goal_/);
    assert.ok(handle.state === "admitted" || handle.state === "ready");

    const resumed = await runCli(
      ["--json", "--session-dir", sessionDir, "--session", handle.session_id],
      env,
    );
    assert.equal(resumed.code, 0, resumed.stderr);
    const again = JSON.parse(resumed.stdout.trim().split("\n").at(-1)!);
    assert.equal(again.goal_id, handle.goal_id);
    assert.equal(again.session_id, handle.session_id);

    const missing = await runCli(
      ["--json", "--session-dir", sessionDir, "--session", "no-such-session"],
      env,
    );
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /unknown session/);
  });

  it("CLI --json --plan-file admits and writes scratch/plan.md without Chrome", async () => {
    const home = await tempRoot();
    const sessionDir = path.join(home, "pi-sessions");
    const planPath = path.join(home, "parent-plan.md");
    await writeFile(
      planPath,
      ["## Goal", "Qualify ~50 nightlife party-goers", "", "## Plan", "1. open venue pages", "2. scrape 200 profiles"].join(
        "\n",
      ),
      "utf8",
    );
    const env = {
      ...process.env,
      BSA_CORE_HOME: home,
      HOME: home,
    };
    const started = await runCli(
      ["--json", "--session-dir", sessionDir, "--plan-file", planPath, "Qualify ~50 nightlife party-goers"],
      env,
    );
    assert.equal(started.code, 0, started.stderr);
    const handle = JSON.parse(started.stdout.trim().split("\n").at(-1)!);
    assert.equal(handle.state, "admitted");
    const planOnDisk = await readFile(path.join(home, "goals", handle.goal_id, "scratch", "plan.md"), "utf8");
    assert.match(planOnDisk, /1\.\s*scout/i);
    assert.match(planOnDisk, /2\.\s*coach/i);
    assert.match(planOnDisk, /3\.\s*harvest/i);
  });
});
