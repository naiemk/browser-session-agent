import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  formatScratchInventory,
  formatScratchRead,
  readScratchFile,
} from "../../src/core/scratch.ts";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length) {
    await rm(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("scratch resume reads", () => {
  it("pages a long file by character offset without repeating the prefix", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-read-"));
    tmpDirs.push(dir);
    const body = `${"a".repeat(2000)}${"b".repeat(80)}`;
    await writeFile(path.join(dir, "long.md"), body, "utf8");
    const first = await readScratchFile(dir, "long.md", 2000, 0);
    assert.ok(!("error" in first));
    if ("error" in first) return;
    assert.equal(first.truncated, true);
    assert.equal(first.nextOffset, 2000);
    assert.equal(first.text, "a".repeat(2000));
    const second = await readScratchFile(dir, "long.md", 2000, first.nextOffset);
    assert.ok(!("error" in second));
    if ("error" in second) return;
    assert.equal(second.truncated, false);
    assert.equal(second.text, "b".repeat(80));
    assert.equal(first.text + second.text, body);
    assert.match(formatScratchRead("long.md", first), /offset=2000 to continue/);
    assert.doesNotMatch(formatScratchRead("long.md", first), /do not repeat/i);
    assert.equal(formatScratchRead("long.md", second), "b".repeat(80));
    const pastEnd = await readScratchFile(dir, "long.md", 2000, body.length);
    assert.ok(!("error" in pastEnd));
    if ("error" in pastEnd) return;
    assert.match(formatScratchRead("long.md", pastEnd), /already at end of long.md/);
  });

  it("lists newest files first so a just-written artifact is visible", () => {
    const older = { name: "aaa.md", bytes: 1, mtime: "2026-09-01T00:00:00.000Z" };
    const newer = { name: "zzz.md", bytes: 9, mtime: "2026-09-07T00:00:00.000Z" };
    const text = formatScratchInventory([older, newer], { maxLines: 1, newestFirst: true });
    assert.match(text, /zzz.md/);
    assert.doesNotMatch(text, /aaa.md/);
  });
});
