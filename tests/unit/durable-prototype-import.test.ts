import assert from "node:assert/strict";
import { access, cp, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { commandDurable } from "../../src/durable/adapters/cli.ts";
import {
  archiveMarkerExists,
  archivePrototypeJob,
  importPrototypeReadOnly,
  validatePrototypeRoot,
} from "../../src/durable/infrastructure/prototype-import.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURES = path.join(ROOT, "tests/fixtures/prototype-jobs");

async function copyFixture(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `bsa-proto-${name}-`));
  await cp(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

describe("CAMPAIGN-R2-E4 prototype dry-run (STORE-06)", () => {
  it("classifies clean / malformed / unsupported without putting unsupported in ok", async () => {
    const clean = await validatePrototypeRoot(path.join(FIXTURES, "clean"));
    assert.deepEqual(clean.ok, ["job_clean001"]);
    assert.equal(clean.malformed.length, 0);
    assert.equal(clean.unsupported.length, 0);

    const badJson = await validatePrototypeRoot(path.join(FIXTURES, "malformed-json"));
    assert.equal(badJson.ok.length, 0);
    assert.equal(badJson.malformed[0]?.jobId, "job_badjson001");

    const thin = await validatePrototypeRoot(path.join(FIXTURES, "missing-fields"));
    assert.equal(thin.ok.length, 0);
    assert.equal(thin.malformed[0]?.jobId, "job_thin001");

    const sprint = await validatePrototypeRoot(path.join(FIXTURES, "unsupported-sprint"));
    assert.equal(sprint.ok.length, 0, "unsupported must not also be ok");
    assert.equal(sprint.unsupported[0]?.jobId, "job_sprint001");
  });

  it("import dry-run keeps runnable false; malformed and unsupported refuse", async () => {
    const ok = await importPrototypeReadOnly(path.join(FIXTURES, "clean"), "job_clean001", {
      dryRun: true,
    });
    assert.equal(ok.class, "ok");
    assert.equal(ok.runnable, false);
    assert.equal(ok.dryRun, true);

    const bad = await importPrototypeReadOnly(path.join(FIXTURES, "malformed-json"), "job_badjson001", {
      dryRun: true,
    });
    assert.equal(bad.class, "malformed");
    assert.equal(bad.runnable, false);

    const sprint = await importPrototypeReadOnly(
      path.join(FIXTURES, "unsupported-sprint"),
      "job_sprint001",
      { dryRun: true },
    );
    assert.equal(sprint.class, "unsupported");
    assert.equal(sprint.runnable, false);
  });

  it("archive --dry-run writes nothing under archive dest", async () => {
    const root = await copyFixture("clean");
    try {
      const archiveRoot = path.join(root, "archive");
      const result = await archivePrototypeJob(root, "job_clean001", archiveRoot, { dryRun: true });
      assert.equal(result.dryRun, true);
      assert.equal(result.wrote, false);
      assert.equal(await archiveMarkerExists(archiveRoot, "job_clean001"), false);
      await assert.rejects(() => access(archiveRoot));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("archive refuses malformed and writes nothing", async () => {
    const root = await copyFixture("malformed-json");
    try {
      const archiveRoot = path.join(root, "archive");
      const result = await archivePrototypeJob(root, "job_badjson001", archiveRoot, { dryRun: false });
      assert.equal(result.class, "malformed");
      assert.equal(result.wrote, false);
      assert.equal(await archiveMarkerExists(archiveRoot, "job_badjson001"), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("archive without dry-run writes ARCHIVE.json; unsupported may archive", async () => {
    const root = await copyFixture("unsupported-sprint");
    try {
      const archiveRoot = path.join(root, "archive");
      const result = await archivePrototypeJob(root, "job_sprint001", archiveRoot, { dryRun: false });
      assert.equal(result.class, "unsupported");
      assert.equal(result.wrote, true);
      assert.equal(result.runnable, false);
      assert.equal(await archiveMarkerExists(archiveRoot, "job_sprint001"), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("CLI import/archive --dry-run: clean exits 0; malformed exits 3; no archive write", async () => {
    const root = await copyFixture("clean");
    const badRoot = await copyFixture("malformed-json");
    try {
      const okCode = await commandDurable({
        positional: ["prototype", "import", "job_clean001"],
        flags: { root, "dry-run": true },
      });
      assert.equal(okCode, 0);

      const badCode = await commandDurable({
        positional: ["prototype", "import", "job_badjson001"],
        flags: { root: badRoot, "dry-run": true, job: "job_badjson001" },
      });
      assert.equal(badCode, 3);

      const archiveCode = await commandDurable({
        positional: ["prototype", "archive", "job_clean001"],
        flags: { root, "dry-run": true, job: "job_clean001" },
      });
      assert.equal(archiveCode, 0);
      assert.equal(await archiveMarkerExists(path.join(root, "archive"), "job_clean001"), false);
      // Ensure dry-run did not create archive tree
      const entries = await readdir(root);
      assert.equal(entries.includes("archive"), false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(badRoot, { recursive: true, force: true });
    }
  });
});
