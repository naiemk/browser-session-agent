import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const PACKAGE_EXTENSIONS: Record<string, string[]> = {
  "pi-model-auto": ["src/index.ts", "dist/pi/extension.js", "dist/extension.js"],
  "pi-meter": ["dist/pi/extension.js", "dist/extension.js"],
};

export async function resolveCostExtensions(): Promise<string[]> {
  const found: string[] = [];
  for (const [name, candidates] of Object.entries(PACKAGE_EXTENSIONS)) {
    const root = resolvePackageRoot(name);
    if (!root) continue;
    for (const rel of candidates) {
      const file = path.join(root, rel);
      if (existsSync(file)) {
        found.push(file);
        break;
      }
    }
  }
  return found;
}

function resolvePackageRoot(name: string): string | undefined {
  try {
    const pkg = require.resolve(`${name}/package.json`);
    return path.dirname(pkg);
  } catch {
    try {
      return path.dirname(require.resolve(name));
    } catch {
      return undefined;
    }
  }
}
