/**
 * Working files for this goal, not the ledger.
 *
 * Workers already have this directory as cwd. The parent does not: it has a session
 * and no shell. These helpers are the bytes that cross that boundary — a name under
 * scratch, never a path that escapes it.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { coreRoot, goalPaths } from "./paths.ts";

/** Observe dumps do not belong here. */
export const SCRATCH_WRITE_MAX_BYTES = 1024 * 1024;

/**
 * Join a relative name under `root`. Nested names are allowed (`extracts/foo.md`).
 * Null if empty, absolute, or it would leave `root`.
 */
export function confinedPath(root: string, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, "/");
  if (path.isAbsolute(trimmed) || path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    return null;
  }
  if (normalized.endsWith("/")) return null;
  const base = path.resolve(root);
  const joined = path.resolve(base, normalized);
  const rel = path.relative(base, joined);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return joined;
}

/**
 * Chat uploads may name a scratch-relative file. Absolute paths (suite fixtures,
 * anything the operator already has on disk) pass through unchanged.
 */
export function resolveUploadPath(scratchDir: string, file: string): string | null {
  const trimmed = file.trim();
  if (!trimmed) return null;
  if (path.isAbsolute(trimmed)) return trimmed;
  return confinedPath(scratchDir, trimmed);
}

/** Null if any name escapes scratch. Empty input stays empty. */
export function resolveUploadFiles(scratchDir: string, files: readonly string[]): string[] | null {
  const resolved: string[] = [];
  for (const file of files) {
    const dest = resolveUploadPath(scratchDir, file);
    if (!dest) return null;
    resolved.push(dest);
  }
  return resolved;
}

export async function ensureScratch(goalId: string, root?: string): Promise<string> {
  const paths = goalPaths(coreRoot(root), goalId);
  await mkdir(paths.scratchDir, { recursive: true });
  return paths.scratchDir;
}

export async function writeScratch(
  scratchDir: string,
  name: string,
  content: string | Uint8Array,
  maxBytes = SCRATCH_WRITE_MAX_BYTES,
): Promise<{ path: string } | { error: string }> {
  const dest = confinedPath(scratchDir, name);
  if (!dest) return { error: "name must be a relative path under scratch" };
  const bytes = typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
  if (bytes > maxBytes) return { error: `content exceeds ${maxBytes} bytes` };
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, content);
  return { path: dest };
}
