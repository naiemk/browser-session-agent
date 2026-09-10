import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("CAMPAIGN-R2-1 adapter FakeKernel ban", () => {
  it("product adapters do not import FakeKernel", () => {
    for (const rel of ["src/durable/adapters/cli.ts", "src/durable/adapters/pi.ts"]) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(
        source,
        /import\s+[^;]*\bFakeKernel\b/,
        `${rel} must not import FakeKernel`,
      );
    }
  });
});
