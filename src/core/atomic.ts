/**
 * Crash-safe JSON snapshots. Direct writeFile can leave a truncated file; write to a
 * sibling then rename over the destination so readers never see a partial object.
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CoreError } from "./types.ts";

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  const raw = await readFile(file, "utf8").catch(() => "");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as T;
}

export function assertSchemaVersion(
  version: unknown,
  expected: number,
  what: string,
): void {
  if (version !== expected) {
    throw new CoreError(
      "schema_mismatch",
      `${what} schema ${String(version)} is not ${expected}`,
      { version, expected },
    );
  }
}
