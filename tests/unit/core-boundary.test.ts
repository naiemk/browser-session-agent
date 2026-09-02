import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CORE = path.join(ROOT, "src/core");

/**
 * D34: the new core is rebuilt from scratch. It may use node builtins and Playwright
 * and nothing else from this repository, so no assumption from the old agent can leak
 * in through an import. The kept CDP plumbing is adapted at cutover (AGENT-09), not
 * imported here.
 */
const ALLOWED_BARE = new Set(["playwright"]);

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

export function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]!);
    }
  }
  return specifiers;
}

export function violations(file: string, source: string): string[] {
  const found: string[] = [];
  for (const specifier of importSpecifiers(source)) {
    if (specifier.startsWith("node:")) continue;
    if (ALLOWED_BARE.has(specifier)) continue;
    if (!specifier.startsWith(".")) {
      found.push(`${path.relative(ROOT, file)} imports bare module "${specifier}"`);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), specifier);
    if (!resolved.startsWith(CORE)) {
      found.push(`${path.relative(ROOT, file)} imports outside the core: "${specifier}"`);
    }
  }
  return found;
}

describe("AGENT-00-T01 new core boundary", () => {
  it("imports nothing from the rebuilt old system", () => {
    const files = sourceFiles(CORE);
    assert.ok(files.length > 0, "expected core source files");
    const found = files.flatMap((file) => violations(file, readFileSync(file, "utf8")));
    assert.deepEqual(found, [], found.join("\n"));
  });

  it("fails on a deliberate violation", () => {
    const fake = path.join(CORE, "fake.ts");
    const bad = [
      `import type { Observation } from "../domain/types.ts";`,
      `import { BrowserSession } from "../session.ts";`,
      `import { evaluatePredicate } from "../plan/evaluate.ts";`,
    ].join("\n");
    const found = violations(fake, bad);
    assert.equal(found.length, 3, found.join("\n"));
    assert.ok(found.every((entry) => entry.includes("outside the core")));
  });

  it("allows node builtins and playwright", () => {
    const fake = path.join(CORE, "fake.ts");
    const good = [
      `import path from "node:path";`,
      `import { chromium } from "playwright";`,
      `import { perceive } from "./perceive.ts";`,
    ].join("\n");
    assert.deepEqual(violations(fake, good), []);
  });
});
