import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { LocalBrowser } from "../../src/core/browser.ts";
import { PlanStore } from "../../src/core/plan.ts";
import { goalPaths } from "../../src/core/paths.ts";
import { JobService } from "../../src/jobs/service.ts";
import { TOOL_ACT, TOOL_DISCOVER } from "../../src/runtime/names.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import {
  FakeClock,
  ZERO_JITTER,
  applyPlan,
  applyTemplate,
  createMockModel,
  outboundGrant,
  readyPatch,
  removeRoot,
  seedApproved,
  tempRoot,
} from "../helpers/job-harness.ts";

const server = new FixtureServer();
let origin = "";
let browser: LocalBrowser;
let root = "";

before(async () => {
  origin = await server.start();
  browser = await LocalBrowser.launch({ headless: true });
  root = await tempRoot("bsa-job-resume-");
});

after(async () => {
  await browser?.close();
  await server.stop();
  if (root) await removeRoot(root);
});

describe("job cold resume and sprints", () => {
  it("resumes from spec and the current sprint after a fresh process", async () => {
    const clock = new FakeClock();
    const processA = new JobService({ root, clock });
    const store = await seedApproved(
      processA,
      "two-step apply",
      readyPatch({
        objective: "two-step apply",
        completionText: "Thanks Ada Lovelace",
        startUrl: `${origin}/apply`,
        sprintTaskLimit: 1,
        grants: [outboundGrant("Submit application")],
        templates: [
          applyTemplate("open", {
            objective: "Open the application form",
            criteria: [{ kind: "url_includes", text: "/apply" }],
          }),
          applyTemplate("apply", {
            objective: "Apply as Ada Lovelace",
            dependencies: ["open"],
          }),
        ],
      }),
    );

    const tab = await browser.openTab(`${origin}/apply`);
    const first = await processA.tick({
      jobId: store.jobId,
      stream: createMockModel({
        plan: [{ tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/apply` } }],
      }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(first.status, "worked");
    assert.equal(first.detail, "success");

    const afterA = await store.readJob();
    const sprintId = afterA.currentSprintId;
    assert.ok(sprintId);

    const processB = new JobService({ root, clock });
    const second = await processB.tick({
      jobId: store.jobId,
      stream: createMockModel({ plan: applyPlan(origin) }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(second.status, "worked");
    assert.equal(second.detail, "success");

    const job = await (await processB.resolve(store.jobId)).readJob();
    assert.ok(job.currentSprintId);
    assert.notEqual(job.currentSprintId, sprintId, "the second task rolled into a new sprint");

    const done = await processB.tick({ jobId: store.jobId, jitter: ZERO_JITTER });
    assert.equal(done.status, "complete");
  });

  it("discovers approved template work and ignores archived sprints", async () => {
    const clock = new FakeClock();
    const processA = new JobService({ root, clock });
    const store = await seedApproved(
      processA,
      "discover then apply",
      readyPatch({
        objective: "discover then apply",
        completionText: "Thanks Ada Lovelace",
        startUrl: `${origin}/find`,
        sprintTaskLimit: 1,
        grants: [outboundGrant("Submit application")],
        templates: [
          {
            id: "scan",
            objective: "Find Ada",
            criteria: [{ kind: "text_visible", text: "Ada Lovelace" }],
          },
          applyTemplate("apply", { discoverable: true }),
        ],
      }),
    );

    const tab = await browser.openTab(`${origin}/find?q=ada`);
    const scan = await processA.tick({
      jobId: store.jobId,
      stream: createMockModel({
        plan: [
          { tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/find?q=ada` } },
          {
            tool: TOOL_DISCOVER,
            args: { templateId: "apply", entities: [{ label: "Ada Lovelace" }] },
          },
        ],
      }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(scan.status, "worked");

    const plan = await PlanStore.open(root, store.jobId);
    const graph = await plan.read();
    assert.ok(
      graph.tasks.some((task) => task.templateId === "apply" && task.objective.includes("Ada Lovelace")),
      "discovery instantiated the approved template",
    );

    const job = await store.readJob();
    const sprintsDir = goalPaths(root, store.jobId).sprintsDir;
    for (const name of await readdir(sprintsDir)) {
      const id = path.basename(name, path.extname(name));
      if (job.currentSprintId && !id.startsWith(job.currentSprintId)) {
        await rm(path.join(sprintsDir, name), { force: true });
      }
    }

    const processB = new JobService({ root, clock });
    const apply = await processB.tick({
      jobId: store.jobId,
      stream: createMockModel({ plan: applyPlan(origin) }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(apply.status, "worked");
    assert.equal(apply.detail, "success");

    const complete = await processB.tick({ jobId: store.jobId, jitter: ZERO_JITTER });
    assert.equal(complete.status, "complete");
  });
});
