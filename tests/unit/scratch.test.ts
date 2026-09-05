import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  confinedPath,
  ensureScratch,
  resolveUploadFiles,
  resolveUploadPath,
  SCRATCH_WRITE_MAX_BYTES,
  writeScratch,
} from "../../src/core/scratch.ts";
import { SAMPLE_CV } from "../../src/suite/tasks.ts";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length) {
    await rm(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-scratch-core-"));
  tmpDirs.push(dir);
  return dir;
}

describe("confinedPath", () => {
  it("allows nested relatives and rejects escapes", async () => {
    const root = await tempDir();
    const nested = confinedPath(root, "extracts/foo.md");
    assert.equal(nested, path.join(root, "extracts", "foo.md"));
    assert.equal(confinedPath(root, "notes.md"), path.join(root, "notes.md"));

    assert.equal(confinedPath(root, ""), null);
    assert.equal(confinedPath(root, "   "), null);
    assert.equal(confinedPath(root, "/tmp/x.md"), null);
    assert.equal(confinedPath(root, ".."), null);
    assert.equal(confinedPath(root, "../secret.md"), null);
    assert.equal(confinedPath(root, "foo/../../etc/passwd"), null);
    assert.equal(confinedPath(root, "."), null);
    assert.equal(confinedPath(root, "extracts/"), null);
  });
});

describe("resolveUploadPath", () => {
  it("passes absolute paths through and confines relatives", async () => {
    const scratch = path.join(await tempDir(), "scratch");
    const absolute = "/tmp/fixtures/cv.txt";
    assert.equal(resolveUploadPath(scratch, absolute), absolute);
    assert.equal(resolveUploadPath(scratch, "cv.txt"), path.join(scratch, "cv.txt"));
    assert.equal(resolveUploadPath(scratch, "../secret"), null);
    assert.equal(resolveUploadPath(scratch, ""), null);
  });

  it("rejects a batch if any name escapes", async () => {
    const scratch = path.join(await tempDir(), "scratch");
    assert.deepEqual(resolveUploadFiles(scratch, []), []);
    assert.deepEqual(resolveUploadFiles(scratch, ["a.md"]), [path.join(scratch, "a.md")]);
    assert.equal(resolveUploadFiles(scratch, ["a.md", "../x"]), null);
  });
});

describe("writeScratch", () => {
  it("writes nested files and refuses traversal and oversize content", async () => {
    const scratch = await ensureScratch("goal_write", await tempDir());
    const ok = await writeScratch(scratch, "extracts/page.md", "# Hello\n");
    assert.equal("path" in ok, true);
    if ("path" in ok) {
      assert.equal(ok.path, path.join(scratch, "extracts", "page.md"));
      assert.equal(await readFile(ok.path, "utf8"), "# Hello\n");
    }

    const escape = await writeScratch(scratch, "../outside.md", "nope");
    assert.deepEqual(escape, { error: "name must be a relative path under scratch" });

    const huge = await writeScratch(scratch, "too-big.md", "x".repeat(SCRATCH_WRITE_MAX_BYTES + 1));
    assert.equal("error" in huge, true);
    if ("error" in huge) assert.match(huge.error, /exceeds/);
  });
});

describe("suite upload fixtures", () => {
  it("keeps the CV fixture as an absolute path outside scratch", () => {
    assert.equal(path.isAbsolute(SAMPLE_CV), true);
    assert.equal(SAMPLE_CV.includes(`${path.sep}scratch${path.sep}`), false);
  });
});
