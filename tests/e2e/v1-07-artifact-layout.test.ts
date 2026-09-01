import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LAYOUT = path.join(ROOT, "dist", "helper-layout");

function pack(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", "pack-helper.mjs")], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`helper:pack failed ${code}: ${err}`));
    });
  });
}

describe("V1-07-T03 unsigned helper layout", () => {
  it("packs the node entry, Chromium notes, manifests, and no secrets", async () => {
    await pack();
    await access(path.join(LAYOUT, "bin", "browser-session-node.mjs"));
    const readme = await readFile(path.join(LAYOUT, "README.md"), "utf8");
    assert.match(readme, /Playwright Chromium/i);
    assert.match(readme, /npx playwright install chromium/);
    assert.match(readme, /browser-session-node/);

    const manifests = await readdir(path.join(LAYOUT, "manifests"), { recursive: true });
    assert.ok(manifests.some((name) => String(name).includes("bsa-protocol.reg")));
    assert.ok(manifests.some((name) => String(name).includes("Info.plist")));

    const files = await readdir(LAYOUT, { recursive: true });
    assert.ok(!files.some((name) => String(name) === ".env" || String(name).endsWith(".env")));
    const packed = await readFile(path.join(LAYOUT, "bin", "browser-session-node.mjs"), "utf8");
    assert.doesNotMatch(packed, /BSA_TOKEN\s*=\s*['\"]/);
    assert.doesNotMatch(readme, /BSA_TOKEN\s*=/);
  });
});
