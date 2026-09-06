/**
 * Paths the operate agent may write for a coding child. Never the Chromium profile.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
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

export interface ScratchListing {
  name: string;
  bytes: number;
  mtime: string;
}

export async function listScratchFiles(scratchDir: string): Promise<ScratchListing[]> {
  const listings: ScratchListing[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(full);
      listings.push({
        name: childRel,
        bytes: info.size,
        mtime: info.mtime.toISOString(),
      });
    }
  }
  await walk(scratchDir, "");
  listings.sort((a, b) => a.name.localeCompare(b.name));
  return listings;
}

export async function readScratchFile(
  scratchDir: string,
  relative: string,
  maxChars: number,
): Promise<{ text: string; bytes: number; truncated: boolean } | { error: string }> {
  const file = confinedPath(scratchDir, relative);
  if (!file) {
    return { error: "scratch_read path must stay inside this goal's scratch directory" };
  }
  let buf: Buffer;
  try {
    buf = await readFile(file);
  } catch {
    return { error: `scratch_read could not open ${relative}` };
  }
  if (buf.includes(0)) {
    return { error: `binary file (${buf.length} bytes); not shown` };
  }
  const text = buf.toString("utf8");
  if (text.length <= maxChars) {
    return { text, bytes: buf.length, truncated: false };
  }
  return {
    text: `${text.slice(0, maxChars).trimEnd()}\n\n[truncated]`,
    bytes: buf.length,
    truncated: true,
  };
}

export function formatScratchInventory(listings: ScratchListing[], maxLines = 20): string {
  if (listings.length === 0) return "Scratch files: (none)";
  const shown = listings.slice(0, maxLines);
  const lines = shown.map((item) => `- ${item.name} ${item.bytes}b`);
  const extra = listings.length - shown.length;
  if (extra > 0) lines.push(`- … ${extra} more`);
  return `Scratch files (${listings.length}):\n${lines.join("\n")}`;
}
