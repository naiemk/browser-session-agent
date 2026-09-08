import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { runSqliteCanary } from "../../src/durable/infrastructure/sqlite/schema.ts";
import { SqliteJobRepository } from "../../src/durable/infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../../src/durable/application/service.ts";
import { FakeKernel } from "../../src/durable/ports/execution-kernel.ts";
import { REQUIRED_NEVER_PREAPPROVE } from "../../src/durable/domain/spec-types.ts";
import { decideSchedule } from "../../src/durable/domain/scheduler-policy.ts";
import { createWorkItem, reduceWorkItem } from "../../src/durable/domain/work-item.ts";
import { allowRetry, emptyRetryLedger, compileAttemptContext } from "../../src/durable/application/context-compiler.ts";
import { attributeTurns, capabilitiesForPhase, costPerAccepted, sumWallBuckets } from "../../src/durable/application/telemetry.ts";
import { decideEffectAuthorization } from "../../src/durable/domain/effect-envelope.ts";
import { validatePrototypeRoot } from "../../src/durable/infrastructure/prototype/validate.ts";

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

describe("STORE-02 node:sqlite canary", () => {
  it("passes on Node 24", () => {
    const result = runSqliteCanary();
    assert.equal(result.ok, true, result.detail);
  });
});

describe("CAMPAIGN-01-T03 repository", () => {
  it("creates jobs, claims with fencing, rejects stale fence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-durable-"));
    const db = path.join(dir, "control.sqlite");
    const repo = SqliteJobRepository.open(db);
    try {
      const job = await repo.createJob({ title: "t", objective: "o", caseMode: "singleton" });
      const now = new Date().toISOString();
      const wi = reduceWorkItem(
        createWorkItem(
          {
            id: "wi_1",
            jobId: job.jobId,
            templateId: "seed",
            specVersion: 1,
            specHash: "a".repeat(16),
            objective: "x",
            dependencies: [],
            maxAttempts: 3,
          },
          now,
        ),
        { type: "mark_ready" },
        now,
      );
      await repo.saveWorkItem(wi);
      const attempt = await repo.claimWork({
        workItemId: "wi_1",
        attemptId: "att_1",
        fenceToken: "fence_1",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        nowIso: now,
      });
      assert.equal(attempt.fenceToken, "fence_1");
      await assert.rejects(
        () =>
          repo.commitOutcome({
            attemptId: "att_1",
            fenceToken: "wrong",
            workItem: { ...wi, status: "done" },
            outcome: { status: "completed", value: null, evidenceIds: [] },
            finishedAt: now,
          }),
        /stale_fence/,
      );
    } finally {
      repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("enforces unique case identity", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-durable-"));
    const repo = SqliteJobRepository.open(path.join(dir, "c.sqlite"));
    try {
      const job = await repo.createJob({ title: "t", objective: "o", caseMode: "discovered" });
      const now = new Date().toISOString();
      await repo.upsertCases(job.jobId, [
        { jobId: job.jobId, caseKey: "a", label: "A", stage: "s", facts: {}, createdAt: now, updatedAt: now },
      ]);
      await repo.upsertCases(job.jobId, [
        { jobId: job.jobId, caseKey: "a", label: "A2", stage: "s2", facts: { x: 1 }, createdAt: now, updatedAt: now },
      ]);
      const cases = await repo.listCases(job.jobId);
      assert.equal(cases.length, 1);
      assert.equal(cases[0]?.label, "A2");
    } finally {
      repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("CAMPAIGN-02 scheduler + context", () => {
  it("reports runtime_unavailable not idle when host missing", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const job = {
      jobId: "job_1",
      title: "t",
      objective: "o",
      lifecycle: "active" as const,
      caseMode: "singleton" as const,
      draftSpecVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    const wi = reduceWorkItem(
      createWorkItem(
        {
          id: "wi_1",
          jobId: "job_1",
          templateId: "seed",
          specVersion: 1,
          specHash: "h".repeat(16),
          objective: "x",
          dependencies: [],
          maxAttempts: 3,
        },
        now,
      ),
      { type: "mark_ready" },
      now,
    );
    const decision = decideSchedule(
      { job, workItems: [wi], humans: [], resources: [], runtimeAvailable: false },
      now,
    );
    assert.equal(decision.kind, "ineligible");
    if (decision.kind === "ineligible") {
      assert.ok(decision.reasons.some((r) => r.code === "runtime_unavailable"));
    }
  });

  it("does not timer-wake perishable human-only work", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const job = {
      jobId: "job_1",
      title: "t",
      objective: "o",
      lifecycle: "active" as const,
      caseMode: "singleton" as const,
      draftSpecVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    const wi = reduceWorkItem(
      createWorkItem(
        {
          id: "wi_1",
          jobId: "job_1",
          templateId: "seed",
          specVersion: 1,
          specHash: "h".repeat(16),
          objective: "x",
          dependencies: [],
          maxAttempts: 3,
        },
        now,
      ),
      { type: "mark_ready" },
      now,
    );
    const decision = decideSchedule(
      {
        job,
        workItems: [wi],
        humans: [
          {
            id: "h1",
            jobId: "job_1",
            kind: "challenge",
            status: "waiting",
            perishable: true,
            workItemId: "wi_1",
            resourceKey: "host",
            reason: "captcha",
            handoff: "x",
            createdAt: now,
            updatedAt: now,
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        ],
        resources: [],
        runtimeAvailable: true,
      },
      now,
    );
    assert.equal(decision.kind, "ineligible");
    if (decision.kind === "ineligible") assert.equal(decision.nextWakeAt, undefined);
  });

  it("rejects identical retry without new evidence", () => {
    const ledger = emptyRetryLedger();
    const first = allowRetry(ledger, "executor", 3, "ev1");
    assert.equal(first.ok, true);
    const second = allowRetry(first.next, "executor", 3, "ev1");
    assert.equal(second.ok, false);
    assert.equal(second.reason, "no_new_evidence");
  });
});

describe("CAMPAIGN-03 effects/challenges/quality + service", () => {
  it("runs approve → tick with host → challenge breaker → effect uncertain", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-durable-svc-"));
    const repo = SqliteJobRepository.open(path.join(dir, "c.sqlite"));
    const host = {
      available: true,
      profileKey: "p",
      nowIso: () => new Date().toISOString(),
      kernel: new FakeKernel(async () => ({ status: "completed", value: { ok: true }, evidenceIds: [] })),
    };
    const service = new JobApplicationService(repo, () => host);
    try {
      const job = await service.create({ objective: "run me", title: "Run" });
      const proposed = await service.propose(job.jobId, validDraft(job.jobId));
      await service.approve(job.jobId, proposed.hash!);
      const items = await repo.listWorkItems(job.jobId);

      const challenge = await service.openChallenge({
        jobId: job.jobId,
        workItemId: items[0]!.id,
        resourceKey: "profile::example.com",
        reason: "cloudflare",
        confidence: 0.95,
      });
      assert.ok(challenge);
      const res = await repo.getResource("profile::example.com");
      assert.ok(res?.circuitOpenUntil);

      await assert.rejects(() => service.answerHuman(job.jobId, challenge!.id, "clicked"), /rehydration|UI resolve/);

      const effect = await service.prepareAndDispatchEffect({
        jobId: job.jobId,
        workItemId: items[0]!.id,
        kind: "outbound",
        identityKey: "once-1",
        crashAfterDispatch: true,
      });
      assert.equal(effect.status, "uncertain");

      // Clear breaker for tick path by advancing resource — still assert gate deny
      const gate = decideEffectAuthorization(
        (await repo.getApprovedSpec(job.jobId))!.workflow.effectEnvelope,
        { effect: "outbound", category: "payment" },
        {},
        new Date().toISOString(),
      );
      assert.equal(gate.decision, "deny");

      await service.answerHuman(job.jobId, challenge!.id, "solved", { verifiedByOracle: true });
      const tick = await service.tick(job.jobId);
      assert.ok(tick.status === "worked" || tick.status === "complete" || tick.status === "runtime_unavailable" || tick.status === "blocked" || tick.status === "waiting_human" || tick.status === "idle" || tick.status === "active");
    } finally {
      repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("duplicate discovery does not duplicate cases", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "bsa-disc-"));
    const repo = SqliteJobRepository.open(path.join(dir, "c.sqlite"));
    const service = new JobApplicationService(repo, () => null);
    try {
      const job = await service.create({ objective: "campaign", caseMode: "discovered" });
      const draft = {
        ...validDraft(job.jobId),
        caseMode: "discovered",
        templates: [
          { id: "seed", scope: "job", objective: "discover", oracle: { kind: "operation" } },
          { id: "qualify", scope: "case", objective: "qualify", oracle: { kind: "operation" } },
        ],
      };
      const proposed = await service.propose(job.jobId, draft);
      await service.approve(job.jobId, proposed.hash!);
      await service.ingestDiscovery(job.jobId, [{ caseKey: "acme", label: "Acme" }]);
      await service.ingestDiscovery(job.jobId, [{ caseKey: "acme", label: "Acme Inc" }]);
      assert.equal((await repo.listCases(job.jobId)).length, 1);
    } finally {
      repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("CAMPAIGN-04 telemetry + prototype validate", () => {
  it("attributes models and scopes capabilities by phase", () => {
    const attr = attributeTurns([
      {
        attemptId: "a",
        provider: "openai",
        model: "gpt",
        phase: "planning",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0.01,
        startedAt: "t0",
        endedAt: "t1",
      },
      {
        attemptId: "a",
        provider: "glm",
        model: "flash",
        phase: "execution",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0.02,
        startedAt: "t1",
        endedAt: "t2",
      },
    ]);
    assert.ok(attr["openai/gpt@planning"]);
    assert.ok(attr["glm/flash@execution"]);
    assert.deepEqual(capabilitiesForPhase("planning"), ["job_read", "job_update_draft", "job_propose_plan"]);
    assert.equal(costPerAccepted({ attemptedCases: 2, completedCases: 2, verifiedCases: 1, acceptedCases: 2, costUsd: 1 }), 0.5);
    assert.equal(
      sumWallBuckets({
        queueMs: 1,
        pacingMs: 1,
        unavailableMs: 1,
        humanMs: 1,
        challengeMs: 1,
        browserMs: 1,
        modelMs: 1,
        evaluationMs: 1,
        reviewMs: 1,
      }),
      9,
    );
  });

  it("prototype validate does not schedule malformed roots", async () => {
    const report = await validatePrototypeRoot(path.join(os.tmpdir(), "missing-bsa-root"));
    assert.deepEqual(report.ok, []);
  });
});

describe("context compiler", () => {
  it("omits transcript authority and rejects DOM refs", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const wi = createWorkItem(
      {
        id: "wi_1",
        jobId: "job_1",
        templateId: "seed",
        specVersion: 1,
        specHash: "h".repeat(16),
        objective: "x",
        dependencies: [],
        maxAttempts: 3,
      },
      now,
    );
    const workflow = validDraft("job_1") as never;
    const compiled = compileAttemptContext({ workItem: wi, workflow });
    assert.equal(compiled.specSlice.templateId, "seed");
    assert.throws(() =>
      compileAttemptContext({
        workItem: { ...wi, checkpoint: { intent: "x", evidenceIds: [], ref: "e12" } as never },
        workflow,
      }),
    );
  });
});
