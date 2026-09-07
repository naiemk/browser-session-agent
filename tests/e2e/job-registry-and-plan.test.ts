import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bindJobCommands } from "../../src/host/pi-jobs.ts";
import { JobService } from "../../src/jobs/service.ts";
import { createFakePi, runCommand, runTool } from "../helpers/fake-pi.ts";
import { APPLY_CRITERIA, readyPatch, removeRoot, tempRoot } from "../helpers/job-harness.ts";

describe("job registry and plan sign-off", () => {
  let root = "";

  afterEach(async () => {
    if (root) await removeRoot(root);
  });

  it("creates, lists, selects, rejects an incomplete plan, then approves a hash", async () => {
    root = await tempRoot();
    const service = new JobService({ root });
    const pi = createFakePi(["yes"]);
    const jobsBind = bindJobCommands(pi, { root, service, headless: true });
    await pi.startSession();
    assert.equal(await jobsBind.injection(), undefined);

    await runCommand(pi, "job-new", "--title outreach weekly SaaS outreach");
    await runCommand(pi, "job-new", "tax research");
    await runCommand(pi, "jobs");
    assert.match(pi.notifications.join("\n"), /outreach/);
    assert.match(pi.notifications.join("\n"), /tax research/);

    const jobs = await service.list();
    const outreach = jobs.find((job) => job.title === "outreach")!;
    await runCommand(pi, "job-use", outreach.jobId);
    await runCommand(pi, "job-title", "Weekly SaaS outreach");
    assert.match((await jobsBind.injection()) ?? "", /\[JOB /);
    assert.match((await jobsBind.injection()) ?? "", /Grill|job-planner|planning/i);
    assert.ok(pi.active.includes("job_propose_plan"), "planning tools load in the planning phase");

    const propose = await runTool(pi, "job_propose_plan", {});
    assert.equal(propose.isError, true);

    await service.updateDraft(
      outreach.jobId,
      readyPatch({
        objective: "Weekly SaaS outreach",
        completionText: "Thanks Ada Lovelace",
        templates: [
          {
            id: "apply",
            objective: "Apply as Ada",
            criteria: APPLY_CRITERIA,
          },
        ],
      }),
    );
    const proposed = await runTool(pi, "job_propose_plan", {});
    assert.equal(proposed.isError, false);
    await runCommand(pi, "job-approve-plan");
    const job = await (await service.resolve(outreach.jobId)).readJob();
    assert.equal(job.status, "active");
    assert.ok(job.approvedSpecHash);
    assert.equal(pi.active.includes("job_propose_plan"), false, "planning tools drop after approval");
    assert.match((await jobsBind.injection()) ?? "", /Sprint execution|bounded task/i);
  });
});
