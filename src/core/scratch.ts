/**
 * Paths the operate agent may write for a coding child. Never the Chromium profile.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function confinedPath(root: string, relative: string): string | undefined {
  const trimmed = relative.trim();
  if (!trimmed || path.isAbsolute(trimmed)) return undefined;
  const base = path.resolve(root);
  const target = path.resolve(base, trimmed);
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (target !== base && !target.startsWith(prefix)) return undefined;
  return target;
}

export async function writeScratchFile(
  scratchDir: string,
  relative: string,
  content: string,
): Promise<{ path: string } | { error: string }> {
  const file = confinedPath(scratchDir, relative);
  if (!file) {
    return { error: "scratch_write path must stay inside this goal's scratch directory" };
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return { path: file };
}
