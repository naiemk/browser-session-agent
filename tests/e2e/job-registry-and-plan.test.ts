import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bindJobCommands } from "../../src/host/pi-jobs.ts";
import { JobService } from "../../src/jobs/service.ts";
import { createFakePi, runCommand, runTool } from "../helpers/fake-pi.ts";
import { APPLY_CRITERIA, readyPatch, removeRoot, tempRoot } from "../helpers/job-harness.ts";

function toolText(result: { content: Array<{ type: string; text?: string }> }): string {
  const block = result.content.find((entry) => entry.type === "text");
  assert.ok(block?.type === "text" && block.text != null);
  return block.text;
}

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
    assert.match(toolText(propose), /issues/);
    assert.doesNotMatch(toolText(propose), /Cannot read properties/);

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

  it("reports real draft issues and proposes a messy successCriteria patch", async () => {
    root = await tempRoot();
    const service = new JobService({ root });
    const pi = createFakePi(["yes"]);
    bindJobCommands(pi, { root, service, headless: true });
    await pi.startSession();
    await runCommand(pi, "job-new", "Apply for YC jobs");

    const incomplete = await runTool(pi, "job_update_draft", { patch: { inScope: ["YC listings"] } });
    const incompleteBody = JSON.parse(toolText(incomplete));
    assert.equal(incompleteBody.ready, false);
    assert.ok(Array.isArray(incompleteBody.issues));
    assert.notEqual(incompleteBody.issues, "draft");
    assert.ok(incompleteBody.issues.some((issue: { code: string }) => issue.code === "templates"));

    await runCommand(pi, "job-scratch");
    assert.match(pi.notifications.join("\n"), /scratch/);

    const messy = await runTool(pi, "job_update_draft", {
      inScope: "YC Work at a Startup",
      outOfScope: ["non-YC"],
      completionCriteria: "operator said stop",
      stopConditions: ["operator stop"],
      templates: [
        {
          id: "apply-to-role",
          objective: "Apply to one matching role",
          successCriteria: [{ kind: "text_visible", text: "Application submitted" }],
          discoverable: true,
        },
      ],
      approvalEnvelope: {
        neverPreapprove: ["destructive", "payment", "credential", "otp", "captcha"],
        grants: ["submit-job-application"],
      },
    });
    const messyBody = JSON.parse(toolText(messy));
    assert.equal(messyBody.ready, true, JSON.stringify(messyBody.issues));
    assert.equal(messyBody.issues.length, 0);

    const proposed = await runTool(pi, "job_propose_plan", {});
    assert.equal(proposed.isError, false, toolText(proposed));
    assert.match(toolText(proposed), /Proposed hash/);
  });
});
