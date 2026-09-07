import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { PlanStore } from "../../src/core/plan.ts";
import { GoalStore } from "../../src/core/state.ts";
import { JobService } from "../../src/jobs/service.ts";
import { TOOL_ACT } from "../../src/runtime/names.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import {
  FakeClock,
  ZERO_JITTER,
  applyPlan,
  applyTemplate,
  createMockModel,
  invitePlan,
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
  root = await tempRoot("bsa-job-gate-");
});

after(async () => {
  await browser?.close();
  await server.stop();
  if (root) await removeRoot(root);
});

describe("job approval grants and idempotency", () => {
  it("parks outbound work without a grant and does not send", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "park send",
      readyPatch({
        objective: "park send",
        completionText: "Invitation sent",
        startUrl: `${origin}/once`,
        templates: [
          {
            id: "invite",
            objective: "Send an invitation to ada",
            criteria: [{ kind: "text_visible", text: "Invitation sent" }],
          },
        ],
      }),
    );
    const tab = await browser.openTab(`${origin}/once`);
    const result = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({ plan: invitePlan(origin) }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(result.status, "waiting_human");
    assert.match(result.detail ?? "", /approval/i);
    assert.match((await browser.facts(tab)).text, /Sends: 0/);
    const inbox = await service.inbox(store.jobId);
    assert.equal(inbox.filter((item) => item.status === "waiting").length, 1);
  });

  it("honours a spec-scoped grant once and still asks for a different action", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "granted send",
      readyPatch({
        objective: "granted send",
        completionText: "Invitation sent",
        startUrl: `${origin}/once`,
        sprintTaskLimit: 2,
        grants: [
          {
            id: "send-once",
            host: "*",
            gateClass: "outbound",
            controlName: "Send invitation",
            maxCount: 1,
          },
        ],
        templates: [
          {
            id: "invite",
            objective: "Send an invitation to ada",
            criteria: [{ kind: "text_visible", text: "Invitation sent" }],
          },
          applyTemplate("apply"),
        ],
      }),
    );

    const tab = await browser.openTab(`${origin}/once`);
    const sent = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({ plan: invitePlan(origin) }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(sent.status, "worked");
    assert.match((await browser.facts(tab)).text, /Sends: 1/);

    const scheduler = await store.readScheduler();
    assert.equal(scheduler.grantUsage["send-once"]?.usedCount, 1);

    const apply = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({ plan: applyPlan(origin) }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(apply.status, "waiting_human", "Submit application is not covered by the send grant");
    assert.equal(scheduler.grantUsage["send-once"]?.usedCount, 1);
  });

  it("reconciles a prepared commit instead of sending twice", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "crash around verify",
      readyPatch({
        objective: "crash around verify",
        completionText: "Invitation sent",
        startUrl: `${origin}/once`,
        grants: [
          {
            id: "send-once",
            host: "*",
            gateClass: "outbound",
            controlName: "Send invitation",
            maxCount: 2,
          },
        ],
        templates: [
          {
            id: "invite",
            objective: "Send an invitation to ada",
            criteria: [{ kind: "text_visible", text: "Invitation sent" }],
          },
        ],
      }),
    );

    const tab = await browser.openTab(`${origin}/once`);
    const first = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({ plan: invitePlan(origin) }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(first.status, "worked");
    assert.match((await browser.facts(tab)).text, /Sends: 1/);

    const plan = await PlanStore.open(root, store.jobId);
    const task = (await plan.read()).tasks[0]!;
    await plan.updateTask(task.id, { status: "pending" });
    const goals = await GoalStore.open(root, store.jobId);
    const entity = await goals.requireEntity(task.entityId!);
    assert.ok(entity.journal);
    await goals.setJournal(task.entityId!, { ...entity.journal!, status: "prepared" });

    const second = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({
        plan: [
          { tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/once` } },
          ...invitePlan(origin).slice(1),
        ],
      }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(second.detail, "reconciled already-done commit");
    assert.match((await browser.facts(tab)).text, /Sends: 1/, "the one-shot send fired once");
  });
});
