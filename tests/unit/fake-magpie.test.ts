import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countStarts,
  parseFakeMagpieArgs,
  readFakeMagpieArgvLog,
  runFakeMagpie,
} from "../helpers/fake-magpie.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FAKE_BIN = path.join(ROOT, "bin", "fake-magpie.mjs");
const homes: string[] = [];

afterEach(async () => {
  while (homes.length) {
    await rm(homes.pop()!, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-fake-magpie-"));
  homes.push(dir);
  return dir;
}

function runBin(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [FAKE_BIN, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

describe("PARENT-01-T03 fake magpie CLI", () => {
  it("parses --json / --session / @plan.md like Magpie parent flags", () => {
    const parsed = parseFakeMagpieArgs([
      "--json",
      "--session-dir",
      "/tmp/s",
      "@plan.md",
      "--name",
      "job",
      "qualify founders",
    ]);
    assert.equal(parsed.json, true);
    assert.equal(parsed.sessionDir, "/tmp/s");
    assert.equal(parsed.planFile, "plan.md");
    assert.equal(parsed.name, "job");
    assert.deepEqual(parsed.rest, ["qualify founders"]);
  });

  it("starts once, resumes the same session, rejects unknown ids", async () => {
    const stateDir = await tempDir();
    const first = await runFakeMagpie(["--json", "--session-dir", "/s", "qualify ~50"], {
      stateDir,
    });
    assert.equal(first.code, 0);
    assert.ok(first.handle?.session_id);
    const handle = JSON.parse(first.stdout.trim());
    assert.equal(handle.session_id, first.handle!.session_id);

    const second = await runFakeMagpie(["--json", "--session", handle.session_id], { stateDir });
    assert.equal(second.code, 0);
    assert.equal(JSON.parse(second.stdout.trim()).goal_id, handle.goal_id);

    const missing = await runFakeMagpie(["--json", "--session", "nope"], { stateDir });
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /unknown session/);
  });

  it("bin logs argv and countStarts sees only start invocations", async () => {
    const stateDir = await tempDir();
    const env = { ...process.env, FAKE_MAGPIE_STATE: stateDir };
    const started = await runBin(["--json", "--session-dir", "/s", "go"], env);
    assert.equal(started.code, 0, started.stderr);
    const id = JSON.parse(started.stdout.trim()).session_id;
    await runBin(["--json", "--session", id], env);
    const log = await readFakeMagpieArgvLog(stateDir);
    assert.equal(countStarts(log), 1);
  });

  it("requires plan file when --plan-file is set", async () => {
    const stateDir = await tempDir();
    const cwd = await tempDir();
    const missing = await runFakeMagpie(["--json", "--plan-file", "missing.md", "x"], {
      stateDir,
      cwd,
    });
    assert.notEqual(missing.code, 0);
    await writeFile(path.join(cwd, "plan.md"), "## Goal\nHi\n", "utf8");
    const ok = await runFakeMagpie(["--json", "--plan-file", "plan.md", "x"], { stateDir, cwd });
    assert.equal(ok.code, 0, ok.stderr);
  });
});

describe("parent-supervisor script wiring", () => {
  it("keeps test:parent-supervisor out of default npm test (D37)", async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.ok(pkg.scripts["test:parent-supervisor"]);
    assert.doesNotMatch(pkg.scripts.test, /parent-supervisor/);
  });
});
