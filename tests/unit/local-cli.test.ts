import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
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
  takeLaunchFlags,
} from "../../src/hosts/local-cli/launch.ts";
import { ROUTER_MODEL, modelAutoExtensionPath } from "../../src/host/pi-subagent/spawn.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BIN = path.join(ROOT, "bin", "bsa-cli.mjs");

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
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
    assert.ok(
      args.some((arg) => arg.replace(/\\/g, "/").includes("pi-model-auto")),
      "parent TUI must load pi-model-auto so floors are not --model ids",
    );
  });

  it("does not duplicate Pi flags the caller already set", () => {
    const args = buildPiArgs("/tmp/ext.ts", ["-e", "/other.ts", "-nbt", "-ns", "-nc", "--print"]);
    assert.equal(args.filter((arg) => arg === "-nbt").length, 1);
    assert.equal(args.filter((arg) => arg === "-ns").length, 1);
    assert.equal(args.filter((arg) => arg === "-nc").length, 1);
    assert.ok(args.includes("/other.ts"));
    assert.ok(args.includes("--print"));
  });

  it("rewrites --model @ultra to pi-router/auto", () => {
    const args = buildPiArgs("/tmp/ext.ts", ["--model", "@ultra"]);
    assert.equal(args[args.indexOf("--model") + 1], ROUTER_MODEL);
    assert.equal(args.includes("@ultra"), false);
  });

  it("Pi help does not fail with Model @ultra not found", async () => {
    const router = modelAutoExtensionPath();
    assert.ok(router);
    const args = buildPiArgs("/tmp/unused-ext.ts", ["-e", router, "--model", "@ultra", "--help"]);
    assert.equal(args.includes("@ultra"), false);
    const result = await new Promise<{ code: number; out: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [piEntryPath(ROOT), ...args], {
        cwd: ROOT,
        env: { ...process.env, PI_OFFLINE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        out += String(chunk);
      });
      child.on("error", reject);
      child.on("exit", (code) => resolve({ code: code ?? 1, out }));
    });
    assert.doesNotMatch(result.out, /Model "@ultra" not found/);
    assert.equal(result.code, 0);
  });

  it("strips --headless before forwarding to Pi", () => {
    const taken = takeHeadless(["--print", "--headless", "hi"], {});
    assert.equal(taken.headless, true);
    assert.deepEqual(taken.args, ["--print", "hi"]);
  });

  it("defaults the CLI to installed Chrome and keeps Chromium behind --chromium", () => {
    assert.equal(takeLaunchFlags(["--print"], {}).browser, "chrome");
    const chromium = takeLaunchFlags(["--print", "--chromium", "hi"], { BSA_BROWSER: "chrome" });
    assert.equal(chromium.browser, "chromium");
    assert.deepEqual(chromium.args, ["--print", "hi"]);
    assert.equal(takeLaunchFlags(["--print"], { BSA_BROWSER: "chromium" }).browser, "chromium");
  });

  it("help describes the local path and leaves VPS as UI-only", () => {
    const text = helpText();
    assert.match(text, /npm run cli/);
    assert.match(text, /magpie/);
    assert.match(text, /\/browser-start/);
    assert.match(text, /\/login/);
    assert.match(text, /no VPS|Nothing talks to the VPS/i);
    assert.match(text, /npm run web|UI-only/);
    assert.match(text, /--chromium/);
    assert.match(text, /Chrome/);
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
    assert.equal(pkg.bin.magpie, "./bin/bsa-cli.mjs");
    assert.equal(pkg.bin.bsa, "./bin/bsa-cli.mjs");
    assert.match(pkg.scripts.cli, /bsa-cli/);
    assert.match(pkg.scripts.dev, /bsa-cli/);
    const items = await collectChecks(ROOT);
    assert.ok(items.find((item) => item.name === "pi")?.ok);
    assert.ok(items.find((item) => item.name === "extension")?.ok);
    assert.ok(items.find((item) => item.name === "chromium"));
    const chromeItems = await collectChecks(ROOT, { browser: "chrome" });
    assert.ok(chromeItems.find((item) => item.name === "chrome"));
    assert.equal(chromeItems.find((item) => item.name === "chromium"), undefined);
    assert.ok(piEntryPath(ROOT).endsWith(path.join("pi-coding-agent", "dist", "cli.js")));
  });

  it("prints help and --check without starting the TUI", async () => {
    const help = await runCli(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /npm run cli/);
    assert.match(help.stdout, /\bmagpie\b/);
    assert.match(help.stdout, /Nothing talks to the VPS/);

    const check = await runCli(["--check", "--chromium"]);
    assert.match(check.stdout, /ok\s+node/);
    assert.match(check.stdout, /ok\s+pi/);
    assert.match(check.stdout, /ok\s+extension/);
    assert.match(check.stdout, /chromium/);
    assert.doesNotMatch(check.stdout + check.stderr, /connecting to wss:\/\//);
    assert.equal(check.code, 0);

    const chromeEnv = { ...process.env };
    delete chromeEnv.BSA_BROWSER;
    const chromeCheck = await runCli(["--check"], chromeEnv);
    assert.match(chromeCheck.stdout, /^\s*(ok|FAIL)\s+chrome\b/m);
    assert.doesNotMatch(chromeCheck.stdout, /^\s*(ok|FAIL)\s+chromium\b/m);
    assert.doesNotMatch(chromeCheck.stdout + chromeCheck.stderr, /connecting to wss:\/\//);
  });

  it("loads tsx from this package when cwd has no node_modules", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "magpie-cli-"));
    try {
      const help = await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
        const child = spawn(process.execPath, [BIN, "--help"], {
          cwd: tmp,
          env: { ...process.env, NODE_PATH: "" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.on("error", reject);
        child.on("exit", (code) => resolve({ code: code ?? 1, stdout }));
      });
      assert.equal(help.code, 0);
      assert.match(help.stdout, /\bmagpie\b/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
