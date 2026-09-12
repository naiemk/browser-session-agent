import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("npm package", () => {
  it("publishes @naiemk/magpi with the magpie CLI bin", async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as {
      name: string;
      bin: Record<string, string>;
      files: string[];
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies?: Record<string, string>;
      publishConfig?: { access?: string };
    };
    // Bare magpie is taken; bare magpi is rejected by npm (too similar to hapi/wagmi).
    assert.equal(pkg.name, "@naiemk/magpi");
    assert.equal(pkg.publishConfig?.access, "public");
    assert.equal(pkg.bin.magpie, "./bin/bsa-cli.mjs");
    assert.equal(pkg.bin.magpie, pkg.bin.bsa);
    assert.match(pkg.scripts.cli, /bsa-cli/);
    assert.ok(pkg.dependencies.tsx, "tsx must ship so magpie can run TypeScript after npm install");
    assert.equal(pkg.devDependencies?.tsx, undefined);
    for (const required of ["bin", "src", "skills", "browser-skills"]) {
      assert.ok(pkg.files.includes(required), `files must include ${required}`);
    }
    assert.equal(
      pkg.files.some((item) => item === "tests" || item.startsWith("tests/")),
      false,
    );
  });
});
