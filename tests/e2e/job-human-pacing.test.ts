import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { LocalBrowser } from "../../src/core/browser.ts";
import { PlanStore } from "../../src/core/plan.ts";
import { JobService } from "../../src/jobs/service.ts";
import { resourceBlocked } from "../../src/jobs/scheduler.ts";
import { TOOL_ACT, TOOL_PARK } from "../../src/runtime/names.ts";
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
  root = await tempRoot("bsa-job-human-");
});

after(async () => {
  await browser?.close();
  await server.stop();
  if (root) await removeRoot(root);
});

const PACING = { minCooldownMs: 1000, maxCooldownMs: 10_000, circuitBreakerAfter: 2 };

describe("job human inbox and pacing", () => {
  it("parks one perishable entity while another task progresses", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "park then apply",
      readyPatch({
        objective: "park then apply",
        completionText: "Thanks Ada Lovelace",
        startUrl: origin,
        sprintTaskLimit: 2,
        pacing: PACING,
        grants: [outboundGrant("Submit application")],
        templates: [
          {
            id: "challenge",
            objective: "Pass the challenge",
            criteria: [{ kind: "text_visible", text: "Challenge cleared" }],
            resource: "captcha.test",
            maxAttempts: 5,
          },
          applyTemplate("apply", { resource: "apply.test" }),
        ],
      }),
    );

    const tab = await browser.openTab(`${origin}/challenge`);
    const parked = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({
        plan: [
          { tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/challenge` } },
          {
            tool: TOOL_PARK,
            args: {
              reason: "CAPTCHA required",
              wake: "human",
              perishable: true,
              kind: "challenge",
              resource: "captcha.test",
              recommendedRetryMs: 5000,
              handoff: "solve the challenge",
            },
          },
        ],
      }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(parked.status, "waiting_human");

    const inbox = await service.inbox(store.jobId);
    assert.equal(inbox[0]?.perishable, true);
    assert.equal(inbox[0]?.kind, "challenge");

    const plan = await PlanStore.open(root, store.jobId);
    const beforeRetry = await plan.read();
    const challenge = beforeRetry.tasks.find((task) => task.templateId === "challenge");
    assert.equal(challenge?.status, "parked");

    const progressed = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({ plan: applyPlan(origin) }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(progressed.status, "worked");
    assert.equal(progressed.detail, "success");

    const stillParked = await plan.requireTask(challenge!.id);
    assert.equal(stillParked.status, "parked", "the captcha task was not retried before notBefore");
    assert.ok(stillParked.deferredUntil && stillParked.deferredUntil > clock.now().toISOString());

    const item = (await service.inbox(store.jobId)).find((entry) => entry.status === "waiting")!;
    await service.prepareHuman(store.jobId, item.id);
    await service.answerHuman(store.jobId, item.id, "operator solved it");

    clock.advance(20_000);
    const cleared = await service.tick({
      jobId: store.jobId,
      stream: createMockModel({
        plan: [{ tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/challenge?gone=1` } }],
      }),
      browser,
      tabId: tab,
      jitter: ZERO_JITTER,
    });
    assert.equal(cleared.status, "worked");
    assert.equal(cleared.detail, "success");
  });

  it("opens a circuit breaker after repeated parks on one resource", async () => {
    const clock = new FakeClock();
    const service = new JobService({ root, clock });
    const store = await seedApproved(
      service,
      "circuit",
      readyPatch({
        objective: "circuit",
        completionText: "Challenge cleared",
        startUrl: `${origin}/challenge`,
        pacing: PACING,
        templates: [
          {
            id: "challenge",
            objective: "Pass the challenge",
            criteria: [{ kind: "text_visible", text: "Challenge cleared" }],
            resource: "captcha.test",
            maxAttempts: 5,
          },
        ],
      }),
    );

    const tab = await browser.openTab(`${origin}/challenge`);
    const parkPlan = {
      plan: [
        { tool: TOOL_ACT, args: { kind: "navigate", url: `${origin}/challenge` } },
        {
          tool: TOOL_PARK,
          args: {
            reason: "CAPTCHA required",
            wake: "human",
            perishable: true,
            resource: "captcha.test",
            recommendedRetryMs: 1000,
          },
        },
      ],
    };

    assert.equal(
      (
        await service.tick({
          jobId: store.jobId,
          stream: createMockModel(parkPlan),
          browser,
          tabId: tab,
          jitter: ZERO_JITTER,
        })
      ).status,
      "waiting_human",
    );

    const first = await store.readScheduler();
    assert.equal(resourceBlocked(first, "captcha.test", clock.now().toISOString()), true);

    clock.advance(5000);
    await service.answerHuman(store.jobId, (await service.inbox(store.jobId))[0]!.id, "try again");

    assert.equal(
      (
        await service.tick({
          jobId: store.jobId,
          stream: createMockModel(parkPlan),
          browser,
          tabId: tab,
          jitter: ZERO_JITTER,
        })
      ).status,
      "waiting_human",
    );

    const second = await store.readScheduler();
    assert.ok(second.resources["captcha.test"]?.circuitOpenUntil);
    assert.equal(resourceBlocked(second, "captcha.test", clock.now().toISOString()), true);

    clock.advance(20_000);
    assert.equal(resourceBlocked(second, "captcha.test", clock.now().toISOString()), false);
  });
});
