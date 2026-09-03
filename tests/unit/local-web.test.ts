import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  chatUrl,
  formatReady,
  helpText,
  LOCAL_WEB_DEFAULT_TOKEN,
  nodeUrl,
  takeLocalWebArgs,
} from "../../src/hosts/local-web/launch.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BIN = path.join(ROOT, "bin", "bsa-web.mjs");

function runWeb(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
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

describe("local web (no VPS)", () => {
  it("defaults to a local token, host, and headed Chromium", () => {
    const parsed = takeLocalWebArgs([]);
    assert.equal(parsed.token, LOCAL_WEB_DEFAULT_TOKEN);
    assert.equal(parsed.host, "127.0.0.1");
    assert.equal(parsed.port, 8787);
    assert.equal(parsed.headless, false);
    assert.equal(chatUrl(parsed.host, parsed.port, parsed.token), "http://127.0.0.1:8787/?token=dev");
    assert.equal(nodeUrl(parsed.host, parsed.port), "ws://127.0.0.1:8787/node");
    assert.equal(nodeUrl("0.0.0.0", 9), "ws://127.0.0.1:9/node");
  });

  it("does not print a custom token and never mentions the VPS installer", () => {
    const ready = formatReady({ host: "127.0.0.1", port: 8787, token: "super-secret", headless: false });
    assert.match(ready, /no VPS/);
    assert.match(ready, /\/browser-start/);
    assert.doesNotMatch(ready, /super-secret/);
    assert.doesNotMatch(ready, /install\.sh/);
    assert.doesNotMatch(ready, /BSA_PAIR_CODE/);
    assert.doesNotMatch(ready, /trustless-commerce/);
    assert.match(formatReady({ host: "127.0.0.1", port: 8787, token: "dev", headless: true }), /\?token=dev/);
    assert.match(formatReady({ host: "127.0.0.1", port: 8787, token: "dev", headless: true }), /headless/);
  });

  it("help describes the web path", () => {
    const text = helpText();
    assert.match(text, /npm run web/);
    assert.match(text, /\?token=dev/);
    assert.match(text, /Nothing talks to the VPS/);
    assert.doesNotMatch(text, /install\.sh/);
  });

  it("declares npm run web", async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as {
      bin: Record<string, string>;
      scripts: Record<string, string>;
    };
    assert.equal(pkg.bin["browser-session-web"], "./bin/bsa-web.mjs");
    assert.match(pkg.scripts.web, /bsa-web/);
  });

  it("prints help and --check without starting Chromium", async () => {
    const help = await runWeb(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /npm run web/);
    assert.match(help.stdout, /Nothing talks to the VPS/);

    const check = await runWeb(["--check"]);
    assert.match(check.stdout, /ok\s+node/);
    assert.match(check.stdout, /ok\s+chromium/);
    assert.doesNotMatch(check.stdout + check.stderr, /connecting to wss:\/\//);
    assert.equal(check.code, 0);
  });
});
