import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildPiArgs,
  collectChecks,
  extensionPath,
  helpText,
  LOCAL_CLI_FLAGS,
  piEntryPath,
  repoRootFrom,
  takeHeadless,
} from "../../src/hosts/local-cli/launch.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BIN = path.join(ROOT, "bin", "bsa-cli.mjs");

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      env: process.env,
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

describe("local CLI (no VPS)", () => {
  it("builds Pi args that load the extension without coding tools or VPS flags", () => {
    const extension = extensionPath(ROOT);
    const args = buildPiArgs(extension);
    assert.deepEqual(args.slice(0, 2), ["-e", extension]);
    for (const flag of LOCAL_CLI_FLAGS) {
      assert.ok(args.includes(flag), flag);
    }
    assert.equal(args.includes("--api"), false);
    assert.equal(args.some((arg) => arg.includes("trustless-commerce")), false);
  });

  it("does not duplicate Pi flags the caller already set", () => {
    const args = buildPiArgs("/tmp/ext.ts", ["-e", "/other.ts", "-nbt", "-ns", "-nc", "--print"]);
    assert.deepEqual(args, ["-e", "/other.ts", "-nbt", "-ns", "-nc", "--print"]);
  });

  it("strips --headless before forwarding to Pi", () => {
    const taken = takeHeadless(["--print", "--headless", "hi"]);
    assert.equal(taken.headless, true);
    assert.deepEqual(taken.args, ["--print", "hi"]);
  });

  it("help describes the local path and leaves VPS as UI-only", () => {
    const text = helpText();
    assert.match(text, /npm run cli/);
    assert.match(text, /\/browser-start/);
    assert.match(text, /\/login/);
    assert.match(text, /no VPS|Nothing talks to the VPS/i);
    assert.match(text, /npm run web|UI-only/);
    assert.doesNotMatch(text, /BSA_PAIR_CODE/);
    assert.doesNotMatch(text, /install\.sh/);
  });

  it("resolves the in-repo Pi entry and extension", async () => {
    const root = repoRootFrom(new URL("../../src/hosts/local-cli/launch.ts", import.meta.url).href);
    assert.equal(root, ROOT);
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as {
      bin: Record<string, string>;
      scripts: Record<string, string>;
    };
    assert.equal(pkg.bin.bsa, "./bin/bsa-cli.mjs");
    assert.match(pkg.scripts.cli, /bsa-cli/);
    assert.match(pkg.scripts.dev, /bsa-cli/);
    const items = await collectChecks(ROOT);
    assert.ok(items.find((item) => item.name === "pi")?.ok);
    assert.ok(items.find((item) => item.name === "extension")?.ok);
    assert.ok(piEntryPath(ROOT).endsWith(path.join("pi-coding-agent", "dist", "cli.js")));
  });

  it("prints help and --check without starting the TUI", async () => {
    const help = await runCli(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /npm run cli/);
    assert.match(help.stdout, /Nothing talks to the VPS/);

    const check = await runCli(["--check"]);
    assert.match(check.stdout, /ok\s+node/);
    assert.match(check.stdout, /ok\s+pi/);
    assert.match(check.stdout, /ok\s+extension/);
    assert.match(check.stdout, /chromium/);
    assert.doesNotMatch(check.stdout + check.stderr, /connecting to wss:\/\//);
    assert.equal(check.code, 0);
  });
});
