import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("AGENT-12-T01 Node 24 and Pi lockstep", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("requires Node >=24", () => {
    assert.equal(pkg.engines.node, ">=24");
    const major = Number(process.versions.node.split(".")[0]);
    assert.ok(major >= 24, `runtime major ${major}`);
  });

  it("keeps direct Pi packages on the same 0.85 line", () => {
    for (const name of [
      "@earendil-works/pi-agent-core",
      "@earendil-works/pi-ai",
      "@earendil-works/pi-coding-agent",
    ]) {
      assert.match(pkg.dependencies[name], /^(\^)?0\.85\./, name);
    }
  });

  it("points CI and installers at Node 24", () => {
    const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    assert.match(ci, /node-version:\s*24/);
    assert.doesNotMatch(ci, /node-version:\s*22/);
    const install = readFileSync(new URL("../../src/hosts/web/public/install.sh", import.meta.url), "utf8");
    assert.match(install, /24\.1\.0/);
    assert.doesNotMatch(install, /22\.19\.0/);
  });
});
