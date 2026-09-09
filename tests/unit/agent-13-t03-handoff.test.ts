import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { FakeKernel, type ExecutionHost } from "../../src/durable/ports/execution-kernel.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { decideSchedule } from "../../src/durable/domain/scheduler-policy.ts";
import { InteractiveChallengeGuard } from "../../src/runtime/challenge-handoff.ts";
import { resetSharedChallengeCoordinator } from "../../src/runtime/resource-coordinator.ts";
import type { ObservationLike } from "../../src/runtime/resource-coordinator.ts";
import type { WireObservation } from "../../src/runtime/wire.ts";
import { buildTools } from "../../src/runtime/tools.ts";
import { memoryEvidence } from "../../src/runtime/evidence.ts";
import { TOOL_ACT, TOOL_DONE } from "../../src/runtime/names.ts";
import type { BrowserPort } from "../../src/core/browser.ts";
import type { Observation } from "../../src/core/types.ts";

const prevFlag = process.env.BSA_CHALLENGE_BEHAVIOR;

afterEach(() => {
  if (prevFlag === undefined) delete process.env.BSA_CHALLENGE_BEHAVIOR;
  else process.env.BSA_CHALLENGE_BEHAVIOR = prevFlag;
  resetSharedChallengeCoordinator();
});

const challengePage: ObservationLike = {
  url: "https://jobs.ex.test/apply",
  title: "Just a moment...",
  text: "Verify you are human before continuing",
};

const cleanPage: ObservationLike = {
  url: "https://jobs.ex.test/apply",
  title: "Open roles",
  text: "Software engineer positions",
};

function challengeWire(): WireObservation {
  return {
    url: "https://jobs.ex.test/apply",
    title: "Just a moment...",
    controls: [],
    identity: { heading: "Verify you are human before continuing" },
  };
}

function cleanWire(): WireObservation {
  return {
    url: "https://jobs.ex.test/apply",
    title: "Open roles",
    controls: [{ ref: "e1", role: "link", name: "Engineering" }],
    identity: { heading: "Careers" },
  };
}

function validDraft(jobId: string) {
  return {
    jobId,
    version: 1,
    objective: "collect",
    caseMode: "singleton",
    templates: [
      {
        id: "seed",
        scope: "job",
        objective: "do work",
        oracle: { kind: "operation" },
        outputSchema: { type: "object" },
      },
    ],
    completionOracle: { kind: "aggregate", rules: [{ type: "operator_stop" }] },
    effectEnvelope: {
      allowed: [{ effect: "outbound" }],
      denied: ["payment", "credential", "otp", "captcha", "destructive"],
      grants: [],
      neverPreapprove: [...REQUIRED_NEVER_PREAPPROVE],
    },
    budgets: { maxTurnsPerAttempt: 4, maxSiteActionsPerAttempt: 10, maxElapsedMsPerAttempt: 60_000 },
  };
}

describe("AGENT-13-T03 interactive halt", () => {
  it("records telemetry but does not halt when the flag is off", async () => {
    delete process.env.BSA_CHALLENGE_BEHAVIOR;
    let takeovers = 0;
    const guard = new InteractiveChallengeGuard("session:t", undefined, async () => {
      takeovers += 1;
    });
    const blocked = await guard.afterObservation({
      observation: challengeWire(),
      intent: "act",
      evidenceIds: [],
    });
    assert.equal(blocked, undefined);
    assert.equal(guard.halted, false);
    assert.equal(takeovers, 0);
  });

  it("halts, focuses once, and refuses until a fresh non-challenge observation", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    let takeovers = 0;
    const guard = new InteractiveChallengeGuard("session:t", undefined, async () => {
      takeovers += 1;
    });

    const first = await guard.afterObservation({
      observation: challengeWire(),
      intent: "act",
      evidenceIds: ["ev-ch"],
    });
    assert.ok(first);
    assert.equal(first.blocked.awaiting_takeover, true);
    assert.equal(guard.halted, true);
    assert.equal(takeovers, 1);
    assert.equal("ref" in (guard.parked?.checkpoint ?? {}), false);

    const still = await guard.afterObservation({
      observation: challengeWire(),
      intent: "observe",
      evidenceIds: ["ev-ch"],
    });
    assert.ok(still);
    assert.equal(takeovers, 1, "takeover is not repeated while still halted");
    assert.equal(guard.blockedReply().blocked.awaiting_takeover, true);

    const cleared = await guard.afterObservation({
      observation: cleanWire(),
      intent: "observe",
      evidenceIds: ["ev-2"],
    });
    assert.equal(cleared, undefined);
    assert.equal(guard.halted, false);
    assert.equal(guard.intentRetriesLeft, 1);
  });

  it("records park and resume timestamps with blocked duration", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const evidence = memoryEvidence();
    const guard = new InteractiveChallengeGuard("session:t", undefined, async () => undefined);
    await guard.afterObservation({
      observation: challengeWire(),
      intent: "act",
      evidenceIds: ["ev-ch"],
      ledger: evidence.ledger,
      metrics: evidence.metrics,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await guard.afterObservation({
      observation: cleanWire(),
      intent: "observe",
      evidenceIds: ["ev-2"],
      ledger: evidence.ledger,
      metrics: evidence.metrics,
    });
    const handoffs = evidence.metrics.records.filter((r) => r.kind === "challenge_handoff");
    assert.ok(handoffs.some((r) => r.kind === "challenge_handoff" && r.phase === "park"));
    const resume = handoffs.find((r) => r.kind === "challenge_handoff" && r.phase === "resume");
    assert.ok(resume);
    assert.ok((resume as { blockedMs?: number }).blockedMs !== undefined);
    const events = await evidence.ledger.read?.();
    assert.ok(events?.some((e) => e.type === "parked"));
    assert.ok(events?.some((e) => e.type === "resumed"));
  });

  it("refuses act while halted but still allows report so the operator can skip", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const guard = new InteractiveChallengeGuard("session:t");
    await guard.afterObservation({
      observation: challengeWire(),
      intent: "act",
      evidenceIds: ["ev-ch"],
    });
    const obs: Observation = {
      id: "obs_1",
      tabId: "tab_1",
      url: "https://jobs.ex.test/apply",
      title: "Just a moment...",
      controls: [],
      dialogs: [],
      errors: [],
      consoleErrors: [],
      failedRequests: [],
      changes: [],
      capturedAt: new Date().toISOString(),
    };
    const browser = {
      observe: async () => obs,
      lastObservation: () => obs,
    } as BrowserPort;
    const tools = buildTools({
      browser,
      tabId: "tab_1",
      evidence: memoryEvidence(),
      challengeGuard: guard,
    });
    const act = tools.find((tool) => (tool as { name: string }).name === TOOL_ACT) as {
      execute: (id: string, params: unknown) => Promise<{ details: unknown }>;
    };
    const report = tools.find((tool) => (tool as { name: string }).name === TOOL_DONE) as {
      execute: (id: string, params: unknown) => Promise<{ details: unknown; terminate?: boolean }>;
    };
    const refused = await act.execute("t-act", {
      kind: "navigate",
      url: "https://jobs.ex.test/next",
    });
    assert.match(JSON.stringify(refused.details), /awaiting_takeover/);
    const skipped = await report.execute("t-report", { status: "blocked", summary: "operator skipped" });
    assert.equal((skipped.details as { status?: string }).status, "blocked");
    assert.equal(skipped.terminate, true);
  });
});

describe("AGENT-13-T03 durable park / resume / skip", () => {
  async function setup(page: { current: ObservationLike }) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-t03-"));
    const repo = SqliteJobRepository.open(path.join(dir, "c.sqlite"));
    let executes = 0;
    let observes = 0;
    let takeovers = 0;
    const host: ExecutionHost = {
      available: true,
      profileKey: "p",
      nowIso: () => new Date().toISOString(),
      kernel: new FakeKernel(async () => {
        executes += 1;
        return { status: "completed", value: page.current, evidenceIds: [`ev-${executes}`] };
      }),
      challenge: {
        observe: async () => {
          observes += 1;
          return page.current;
        },
        takeover: async () => {
          takeovers += 1;
        },
      },
    };
    const service = new JobApplicationService(repo, () => host);
    const job = await service.create({ objective: "apply", title: "Apply" });
    const proposed = await service.propose(job.jobId, validDraft(job.jobId));
    await service.approve(job.jobId, proposed.hash!);
    return {
      dir,
      repo,
      service,
      jobId: job.jobId,
      counts: () => ({ executes, observes, takeovers }),
    };
  }

  it("does not park when challenge behavior is off", async () => {
    delete process.env.BSA_CHALLENGE_BEHAVIOR;
    const page = { current: challengePage };
    const ctx = await setup(page);
    try {
      const tick = await ctx.service.tick(ctx.jobId);
      assert.equal(tick.status, "worked");
      assert.equal((await ctx.repo.listHumans(ctx.jobId)).length, 0);
      assert.equal((await ctx.repo.listWorkItems(ctx.jobId))[0]?.status, "done");
    } finally {
      ctx.repo.close();
      await rm(ctx.dir, { recursive: true, force: true });
    }
  });

  it("parks one perishable challenge item and does not complete the work", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const page = { current: challengePage };
    const ctx = await setup(page);
    try {
      const first = await ctx.service.tick(ctx.jobId);
      assert.equal(first.status, "waiting_human");
      const humans = await ctx.repo.listHumans(ctx.jobId);
      assert.equal(humans.length, 1);
      assert.equal(humans[0]?.kind, "challenge");
      assert.equal(humans[0]?.perishable, true);
      assert.equal(humans[0]?.status, "waiting");
      assert.ok(humans[0]?.checkpoint);
      assert.equal("ref" in (humans[0]?.checkpoint ?? {}), false);
      assert.equal((await ctx.repo.listWorkItems(ctx.jobId))[0]?.status, "blocked");

      const second = await ctx.service.tick(ctx.jobId);
      assert.equal(second.status, "waiting_human");
      assert.equal((await ctx.repo.listHumans(ctx.jobId)).length, 1);
      assert.equal(ctx.counts().executes, 1, "the worker released the lease; no retry while parked");
    } finally {
      ctx.repo.close();
      await rm(ctx.dir, { recursive: true, force: true });
    }
  });

  it("keeps unresolved challenge work ineligible after the resource cooldown expires", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const page = { current: challengePage };
    const ctx = await setup(page);
    try {
      await ctx.service.tick(ctx.jobId);
      const resources = await ctx.repo.listResources();
      const hostRes = resources.find((r) => r.key.startsWith("host:"));
      assert.ok(hostRes);
      await ctx.repo.saveResource({ ...hostRes, circuitOpenUntil: "2000-01-01T00:00:00.000Z" });

      const humans = await ctx.repo.listHumans(ctx.jobId);
      const items = await ctx.repo.listWorkItems(ctx.jobId);
      const job = (await ctx.repo.getJob(ctx.jobId))!;
      const decision = decideSchedule(
        {
          job,
          workItems: items.map((item) => ({ ...item, status: "ready" })),
          humans,
          resources: await ctx.repo.listResources(),
          runtimeAvailable: true,
        },
        "2026-09-09T12:00:00.000Z",
      );
      assert.equal(decision.kind, "ineligible");
      if (decision.kind === "ineligible") {
        assert.equal(decision.nextWakeAt, undefined);
        assert.ok(decision.reasons.some((r) => r.code === "waiting_human"));
      }
    } finally {
      ctx.repo.close();
      await rm(ctx.dir, { recursive: true, force: true });
    }
  });

  it("prepares headed rehydration, resumes from a fresh observation, and redrives the intent once", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const page = { current: challengePage };
    const ctx = await setup(page);
    try {
      await ctx.service.tick(ctx.jobId);
      const human = (await ctx.repo.listHumans(ctx.jobId))[0]!;
      await assert.rejects(
        () => ctx.service.answerHuman(ctx.jobId, human.id, "clicked"),
        /rehydration|UI resolve/,
      );

      const prepared = await ctx.service.prepareHuman(ctx.jobId, human.id);
      assert.equal(prepared.status, "rehydrating");
      assert.equal(ctx.counts().takeovers, 1);
      assert.equal(ctx.counts().observes, 1);

      page.current = cleanPage;
      const resumed = await ctx.service.resumeChallenge(ctx.jobId, human.id);
      assert.equal(resumed.status, "resumed");
      assert.equal((await ctx.repo.listWorkItems(ctx.jobId))[0]?.status, "ready");

      const after = await ctx.service.tick(ctx.jobId);
      assert.equal(after.status, "worked");
      assert.equal(ctx.counts().executes, 2, "the parked work item is retried once after resume");
      assert.equal((await ctx.repo.listWorkItems(ctx.jobId))[0]?.status, "done");
    } finally {
      ctx.repo.close();
      await rm(ctx.dir, { recursive: true, force: true });
    }
  });

  it("keeps work blocked when resume still sees a challenge", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const page = { current: challengePage };
    const ctx = await setup(page);
    try {
      await ctx.service.tick(ctx.jobId);
      const human = (await ctx.repo.listHumans(ctx.jobId))[0]!;
      const still = await ctx.service.resumeChallenge(ctx.jobId, human.id);
      assert.equal(still.status, "still_blocked");
      assert.equal((await ctx.repo.listWorkItems(ctx.jobId))[0]?.status, "blocked");
      assert.equal((await ctx.repo.listHumans(ctx.jobId))[0]?.status, "waiting");
      assert.equal(ctx.counts().executes, 1);
    } finally {
      ctx.repo.close();
      await rm(ctx.dir, { recursive: true, force: true });
    }
  });

  it("skip resolves the request without completing the blocked operation", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const page = { current: challengePage };
    const ctx = await setup(page);
    try {
      await ctx.service.tick(ctx.jobId);
      const human = (await ctx.repo.listHumans(ctx.jobId))[0]!;
      const skipped = await ctx.service.skipHuman(ctx.jobId, human.id);
      assert.equal(skipped.status, "skipped");
      const work = (await ctx.repo.listWorkItems(ctx.jobId))[0]!;
      assert.equal(work.status, "blocked");
      assert.notEqual(work.status, "done");

      const next = await ctx.service.tick(ctx.jobId);
      assert.notEqual(next.status, "complete");
      assert.equal(ctx.counts().executes, 1);
    } finally {
      ctx.repo.close();
      await rm(ctx.dir, { recursive: true, force: true });
    }
  });

  it("returns a typed recovery when the tab is gone instead of replaying a ref", async () => {
    process.env.BSA_CHALLENGE_BEHAVIOR = "1";
    const page = { current: challengePage };
    const ctx = await setup(page);
    try {
      await ctx.service.tick(ctx.jobId);
      const human = (await ctx.repo.listHumans(ctx.jobId))[0]!;
      page.current = {};
      const result = await ctx.service.resumeChallenge(ctx.jobId, human.id);
      assert.equal(result.status, "expired_tab");
      assert.equal((await ctx.repo.listWorkItems(ctx.jobId))[0]?.status, "blocked");
    } finally {
      ctx.repo.close();
      await rm(ctx.dir, { recursive: true, force: true });
    }
  });
});
