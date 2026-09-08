import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { main } from "../../src/cli/main.ts";
import { JobService } from "../../src/jobs/service.ts";
import { applyTemplate, readyPatch, removeRoot, seedApproved, tempRoot } from "../helpers/job-harness.ts";

async function captureMain(argv: string[]): Promise<{ code: number; out: string }> {
  const captured: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    captured.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await main(argv);
    return { code, out: captured.join("") };
  } finally {
    process.stdout.write = write;
  }
}

describe("job CLI smoke", () => {
  let root = "";

  afterEach(async () => {
    if (root) await removeRoot(root);
  });

  it("creates, lists, titles, pauses, resumes, and ticks", async () => {
    root = await tempRoot();
    const created = await captureMain(["job", "create", "CLI smoke", "--title", "Smoke", "--root", root]);
    assert.equal(created.code, 0);
    const id = created.out.match(/job_[a-z0-9]+/)?.[0];
    assert.ok(id);

    const listed = await captureMain(["jobs", "--root", root]);
    assert.equal(listed.code, 0);
    assert.match(listed.out, /Smoke/);

    const titled = await captureMain(["job", "title", id, "CLI Smoke", "--root", root]);
    assert.equal(titled.code, 0);
    assert.match(titled.out, /CLI Smoke/);

    const shown = await captureMain(["job", "show", id, "--root", root, "--json"]);
    assert.equal(shown.code, 0);
    assert.match(shown.out, /planning/);

    const idle = await captureMain(["job", "tick", id, "--root", root, "--json"]);
    assert.equal(idle.code, 0);
    assert.match(idle.out, /idle|planning/);

    const service = new JobService({ root });
    await service.updateDraft(
      id,
      readyPatch({
        objective: "CLI smoke",
        completionText: "Thanks Ada Lovelace",
        templates: [applyTemplate()],
      }),
    );
    const proposed = await service.proposePlan(id);
    const approved = await captureMain([
      "job",
      "approve-plan",
      id,
      "--hash",
      proposed.hash!,
      "--root",
      root,
      "--json",
    ]);
    assert.equal(approved.code, 0);

    assert.equal((await captureMain(["job", "pause", id, "--root", root, "--json"])).code, 0);
    const paused = await captureMain(["job", "show", id, "--root", root, "--json"]);
    assert.match(paused.out, /paused/);
    assert.equal((await captureMain(["job", "resume", id, "--root", root, "--json"])).code, 0);
    const ticked = await captureMain(["job", "tick", id, "--root", root, "--json"]);
    assert.equal(ticked.code, 4);
    assert.match(ticked.out, /runtime_unavailable/);
  });

  it("seeded jobs survive a second process listing them", async () => {
    root = await tempRoot();
    const first = new JobService({ root });
    await seedApproved(
      first,
      "list later",
      readyPatch({
        objective: "list later",
        completionText: "Thanks Ada Lovelace",
        templates: [applyTemplate()],
      }),
      "Listed job",
    );
    const second = new JobService({ root });
    const listed = await second.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.title, "Listed job");
    assert.equal(listed[0]?.status, "active");
  });
});
