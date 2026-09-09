import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { importSpecifiers } from "./core-boundary.test.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOMAIN = path.join(ROOT, "src/durable/domain");

const BANNED_SUBSTRINGS = [
  "playwright",
  "node:fs",
  "node:sqlite",
  "/cli/",
  "/host/pi",
  "fabric",
  "better-sqlite",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("DOM-02 durable domain import boundary", () => {
  it("imports only relative domain/application-free pure modules", () => {
    const files = sourceFiles(DOMAIN);
    assert.ok(files.length > 0);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        const lower = specifier.toLowerCase();
        for (const banned of BANNED_SUBSTRINGS) {
          if (lower.includes(banned)) {
            violations.push(`${path.relative(ROOT, file)} imports banned "${specifier}"`);
          }
        }
        if (specifier.startsWith("node:") && specifier !== "node:assert") {
          // Domain may not use node builtins that imply I/O.
          if (specifier === "node:fs" || specifier === "node:path" || specifier === "node:sqlite") {
            violations.push(`${path.relative(ROOT, file)} imports node I/O "${specifier}"`);
          }
        }
        if (!specifier.startsWith(".") && !specifier.startsWith("node:")) {
          violations.push(`${path.relative(ROOT, file)} imports bare module "${specifier}"`);
        }
        if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), specifier);
          if (!resolved.startsWith(DOMAIN)) {
            violations.push(`${path.relative(ROOT, file)} imports outside domain: "${specifier}"`);
          }
        }
      }
    }
    assert.deepEqual(violations, [], violations.join("\n"));
  });

  it("fails on a deliberate banned import", () => {
    const bad = `import fs from "node:fs";\nimport { chromium } from "playwright";\n`;
    const hits = BANNED_SUBSTRINGS.filter((banned) => bad.toLowerCase().includes(banned));
    assert.ok(hits.length >= 2);
  });
});
