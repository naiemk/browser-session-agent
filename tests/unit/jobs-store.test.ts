import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { GoalStore } from "../../src/core/state.ts";
import { CoreError } from "../../src/core/types.ts";
import { JobService } from "../../src/jobs/service.ts";
import { listJobs } from "../../src/jobs/store.ts";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "jobs-store-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("job registry", () => {
  it("lists only directories with job.json and keeps titles off the identity", async () => {
    const service = new JobService({ root });
    const a = await service.create("Weekly outreach", "saas-outreach");
    await service.create("Tax research", "tax-research");
    await GoalStore.open(root, "goal_oneshot", "not a job");

    const listed = await listJobs(root);
    assert.equal(listed.length, 2);
    assert.ok(listed.every((job) => job.jobId.startsWith("job_")));
    assert.ok(listed.some((job) => job.title === "saas-outreach"));

    const renamed = await service.rename(a.jobId, "Weekly SaaS outreach");
    assert.equal(renamed.jobId, a.jobId);
    assert.equal(renamed.title, "Weekly SaaS outreach");
  });

  it("resolves unique prefixes and refuses illegal transitions", async () => {
    const service = new JobService({ root });
    const store = await service.create("Plan meals");
    await assert.rejects(() => service.resume(store.jobId), (err: unknown) => {
      return err instanceof CoreError && err.code === "illegal_transition";
    });
    const same = await service.resolve(store.jobId.slice(0, 8));
    assert.equal(same.jobId, store.jobId);
  });
});
