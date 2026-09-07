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

export interface ScratchRead {
  text: string;
  bytes: number;
  totalChars: number;
  offset: number;
  nextOffset: number;
  truncated: boolean;
}

export async function readScratchFile(
  scratchDir: string,
  relative: string,
  maxChars: number,
  offset = 0,
): Promise<ScratchRead | { error: string }> {
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
  const from = Math.max(0, Math.min(Math.floor(offset) || 0, text.length));
  const slice = text.slice(from, from + maxChars);
  const nextOffset = from + slice.length;
  return {
    text: slice,
    bytes: buf.length,
    totalChars: text.length,
    offset: from,
    nextOffset,
    truncated: nextOffset < text.length,
  };
}

export function formatScratchRead(name: string, read: ScratchRead): string {
  if (read.offset >= read.totalChars && read.totalChars > 0) {
    return `(already at end of ${name}; ${read.totalChars} chars)`;
  }
  if (!read.truncated) return read.text;
  return (
    `${read.text.trimEnd()}\n\n` +
    `[truncated at ${read.nextOffset} of ${read.totalChars} chars; ` +
    `scratch_read name=${name} offset=${read.nextOffset} to continue]`
  );
}

export function formatScratchInventory(
  listings: ScratchListing[],
  options: { maxLines?: number; newestFirst?: boolean } = {},
): string {
  if (listings.length === 0) return "Scratch files: (none)";
  const maxLines = options.maxLines ?? 20;
  const ordered = options.newestFirst
    ? [...listings].sort((a, b) => b.mtime.localeCompare(a.mtime) || a.name.localeCompare(b.name))
    : listings;
  const shown = ordered.slice(0, maxLines);
  const extra = ordered.length - shown.length;
  const lines = shown.map((item) => `- ${item.name} ${item.bytes}b`);
  if (extra > 0) lines.push(`- … ${extra} more`);
  return `Scratch files (${listings.length}):\n${lines.join("\n")}`;
}
