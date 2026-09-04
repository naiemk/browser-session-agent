import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * Every package `src/` imports has to be declared in package.json.
 *
 * npm hoists transitive dependencies to the top of node_modules when nothing conflicts, so
 * an undeclared import resolves perfectly on a developer machine and then fails under
 * `npm ci`, which installs from the lockfile and nests them. That is exactly how
 * `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` reached CI undeclared: the
 * runtime imported both, only `pi-coding-agent` declared them, and the local typecheck was
 * green while CI could not resolve the module at all.
 *
 * The version skew is the quieter half of the same bug. Hoisting had resolved top-level
 * `pi-ai` to 0.74.2 while `pi-coding-agent` used 0.84.4, so our code was typechecking
 * against one version of the protocol and running against another.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BUILTINS = new Set(builtinModules);

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

/**
 * Import specifiers, anchored to statements.
 *
 * A looser "anything after `from`" scan reads prose as code: two comments in this repo say
 * `different outcome from "failed"` and `Distinguished from "no report filed"`, and both
 * were reported as missing dependencies. Real import and export statements start their
 * line; a dynamic `import(...)` is matched anywhere because it is usually mid-expression.
 */
export function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /^\s*(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]!);
  }
  return specifiers;
}

/** npm names are lowercase and have no spaces, which rules out most prose. */
const PACKAGE_NAME = /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/;

/** `@scope/name/sub/path` and `name/sub` both belong to the package, not the subpath. */
export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

export function externalPackages(files: Array<{ file: string; source: string }>): Map<
  string,
  string[]
> {
  const used = new Map<string, string[]>();
  for (const { file, source } of files) {
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      if (specifier.startsWith("node:")) continue;
      const name = packageName(specifier);
      if (BUILTINS.has(name)) continue;
      if (!PACKAGE_NAME.test(name)) continue;

      const where = used.get(name) ?? [];
      where.push(path.relative(ROOT, file));
      used.set(name, where);
    }
  }
  return used;
}

describe("dependency declarations", () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);

  it("declares every package that src imports", () => {
    const files = sourceFiles(path.join(ROOT, "src")).map((file) => ({
      file,
      source: readFileSync(file, "utf8"),
    }));
    assert.ok(files.length > 0, "expected source files");

    const undeclared = [...externalPackages(files)]
      .filter(([name]) => !declared.has(name))
      .map(([name, where]) => `${name} (imported by ${where.slice(0, 3).join(", ")})`);

    assert.deepEqual(
      undeclared,
      [],
      `undeclared dependencies resolve locally by hoisting and break under npm ci:\n${undeclared.join("\n")}`,
    );
  });

  it("pins the pi packages to one version, so the protocol cannot skew", () => {
    // These three implement one protocol between them. Different majors of pi-ai on either
    // side of the model port means typechecking against a protocol we do not run.
    const pinned = [
      "@earendil-works/pi-agent-core",
      "@earendil-works/pi-ai",
      "@earendil-works/pi-coding-agent",
    ];
    const ranges = new Set(pinned.map((name) => manifest.dependencies?.[name]));

    for (const name of pinned) {
      assert.ok(manifest.dependencies?.[name], `${name} must be a direct dependency`);
    }
    assert.equal(
      ranges.size,
      1,
      `the pi packages must share one version range, found ${[...ranges].join(", ")}`,
    );
  });

  it("catches an undeclared import", () => {
    const used = externalPackages([
      { file: path.join(ROOT, "src/fake.ts"), source: `import x from "not-a-real-package";` },
    ]);
    assert.deepEqual([...used.keys()], ["not-a-real-package"]);
  });

  it("attributes subpath imports to their package", () => {
    assert.equal(packageName("@earendil-works/pi-ai/compat"), "@earendil-works/pi-ai");
    assert.equal(packageName("playwright/test"), "playwright");
    assert.equal(packageName("ws"), "ws");
  });

  it("does not read prose as an import", () => {
    // Both of these are real comments in src/suite, and both were reported as missing
    // dependencies by a looser scan.
    const used = externalPackages([
      {
        file: path.join(ROOT, "src/fake.ts"),
        source: [
          ` * a step cap produces "capped", which is a different outcome from "failed"`,
          `// Distinguished from "no report filed", which hides a refusal as a mystery.`,
          `import { act } from "./core/act.ts";`,
        ].join("\n"),
      },
    ]);
    assert.deepEqual([...used.keys()], []);
  });

  it("ignores relative imports and builtins", () => {
    const used = externalPackages([
      {
        file: path.join(ROOT, "src/fake.ts"),
        source: [
          `import path from "node:path";`,
          `import { readFileSync } from "fs";`,
          `import { act } from "./core/act.ts";`,
        ].join("\n"),
      },
    ]);
    assert.deepEqual([...used.keys()], []);
  });
});
