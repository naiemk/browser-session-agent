import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { LocalBrowser } from "../../src/core/browser.ts";
import { acquireLease } from "../../src/core/lease.ts";
import { goalPaths } from "../../src/core/paths.ts";
import { JobService } from "../../src/jobs/service.ts";
import { TOOL_DONE } from "../../src/runtime/names.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import {
  FakeClock,
  ZERO_JITTER,
  applyTemplate,
  createMockModel,
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
  root = await tempRoot("bsa-job-lease-");
});

after(async () => {
  await browser?.close();
  await server.stop();
  if (root) await removeRoot(root);
});

describe("job leases and budgets", () => {
  it("returns busy while a job lease is held, then steals an expired one", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "lease",
      readyPatch({
        objective: "lease",
        completionText: "Thanks Ada Lovelace",
        templates: [applyTemplate()],
      }),
    );
    const lockDir = path.join(goalPaths(root, store.jobId).locksDir, "job");
    const held = await acquireLease(lockDir, { owner: "stale", ttlMs: 1000, clock });
    assert.ok(held);

    const busy = await service.tick({ jobId: store.jobId, owner: "other", jitter: ZERO_JITTER });
    assert.equal(busy.status, "busy");

    clock.advance(2000);
    const stolen = await service.tick({ jobId: store.jobId, owner: "fresh", jitter: ZERO_JITTER });
    assert.equal(stolen.status, "runtime_unavailable");
    assert.match(stolen.detail ?? "", /no model\/browser host/i);
  });

  it("fails the job when the cost budget is exhausted", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "cost cap",
      readyPatch({
        objective: "cost cap",
        completionText: "Thanks Ada Lovelace",
        startUrl: `${origin}/apply`,
        maxCostUsd: 0.3,
        templates: [applyTemplate()],
      }),
    );
    const tab = await browser.openTab(`${origin}/apply`);
    const first = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({
        script: [
          {
            calls: [{ name: TOOL_DONE, arguments: { status: "success", summary: "claimed" } }],
          },
        ],
        usagePerTurn: { costUsd: 0.4 },
      }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(first.status, "worked");

    const second = await service.tick({
      jobId: store.jobId,
      jitter: ZERO_JITTER,
    });
    assert.equal(second.status, "failed");
    assert.match(second.detail ?? "", /cost budget/);
  });

  it("caps attempts and fails the task without looping", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "attempt cap",
      readyPatch({
        objective: "attempt cap",
        completionText: "Thanks Ada Lovelace",
        startUrl: `${origin}/apply`,
        templates: [applyTemplate("apply", { maxAttempts: 1 })],
      }),
    );
    const tab = await browser.openTab(`${origin}/apply`);
    const result = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({
        script: [
          {
            calls: [{ name: TOOL_DONE, arguments: { status: "success", summary: "I did it" } }],
          },
        ],
      }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(result.status, "failed");
    assert.match(result.detail ?? "", /criteria not met|attempts exhausted/);
  });
});
