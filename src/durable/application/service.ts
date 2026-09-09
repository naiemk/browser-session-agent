import { transitionJobLifecycle } from "../domain/job-lifecycle.ts";
import { reduceWorkItem } from "../domain/work-item.ts";
import { DomainError } from "../domain/errors.ts";
import type { HumanRequest, Job, OperationOutcome, SpecVersion } from "../domain/types.ts";
import type { JobRepository } from "../ports/repository.ts";
import type { ExecutionHost } from "../ports/execution-kernel.ts";
import { proposeStrict, draftFeedback, newId, hashCanonicalBytes } from "./planning.ts";
import { materializeSeedWorkItems, materializeCaseWorkItems, discoveryToCase, type DiscoveryRecord } from "./materialize.ts";
import type { RevisionMigration } from "./revision.ts";
import { dispatchDueJob, dispatchDueScan, type TickReport } from "./dispatcher.ts";
import { deriveDisplayStatus } from "./status.ts";
import type { CancelJobCommand, CancelWorkItemCommand } from "./commands.ts";
import { createEffect, reduceEffect } from "../domain/effect.ts";
import { decideEffectAuthorization } from "../domain/effect-envelope.ts";
import type { EffectIntent } from "../domain/effect-envelope.ts";
import {
  detectChallenge,
  evidenceHashOf,
  type ChallengeDetection,
} from "../../runtime/challenge-detector.ts";
import { sharedChallengeCoordinator } from "../../runtime/resource-coordinator.ts";

export class JobApplicationService {
  constructor(
    readonly repo: JobRepository,
    private readonly hostFactory: () => ExecutionHost | null = () => null,
  ) {}

  async create(input: { objective: string; title?: string; caseMode?: Job["caseMode"] }): Promise<Job> {
    return this.repo.createJob({
      title: input.title?.trim() || input.objective.trim().slice(0, 80),
      objective: input.objective.trim(),
      caseMode: input.caseMode ?? "singleton",
    });
  }

  draftFeedback(draft: unknown) {
    return draftFeedback(draft);
  }

  async propose(jobId: string, draft: unknown): Promise<SpecVersion> {
    const job = await this.requireJob(jobId);
    const compiled = proposeStrict({ ...asObject(draft), jobId, version: job.draftSpecVersion });
    const now = new Date().toISOString();
    const record: SpecVersion = {
      jobId,
      version: job.draftSpecVersion,
      status: "proposed",
      hash: compiled.hash,
      canonicalBytes: compiled.canonicalBytes,
      createdAt: now,
    };
    await this.repo.saveSpecVersion(record);
    await this.repo.saveJob(transitionJobLifecycle(job, "awaiting_plan_approval", now));
    return record;
  }

  async approve(jobId: string, expectedHash: string): Promise<SpecVersion> {
    const job = await this.requireJob(jobId);
    const proposed = await this.repo.getSpecVersion(jobId, job.draftSpecVersion);
    if (!proposed || proposed.status !== "proposed" || !proposed.hash) {
      throw new DomainError("not_proposed", "propose before approve");
    }
    if (proposed.hash !== expectedHash) throw new DomainError("hash_mismatch", "spec hash mismatch");
    const now = new Date().toISOString();
    const approved: SpecVersion = { ...proposed, status: "approved", approvedAt: now };
    await this.repo.saveSpecVersion(approved);
    const workflow = JSON.parse(approved.canonicalBytes);
    const seeds = materializeSeedWorkItems(
      { ...job, lifecycle: "active" },
      workflow,
      approved.hash!,
      now,
    );
    for (const seed of seeds) {
      await this.repo.saveWorkItem(reduceWorkItem(seed, { type: "mark_ready" }, now));
    }
    await this.repo.saveJob({
      ...transitionJobLifecycle(job, "active", now),
      activeSpecVersion: approved.version,
      activeSpecHash: approved.hash,
    });
    return approved;
  }

  async ingestDiscovery(jobId: string, records: DiscoveryRecord[]): Promise<void> {
    const job = await this.requireJob(jobId);
    const approved = await this.repo.getApprovedSpec(jobId);
    if (!approved?.record.hash) throw new DomainError("no_approved_spec", jobId);
    const now = new Date().toISOString();
    const cases = records.map((r) => discoveryToCase(jobId, r, now));
    await this.repo.upsertCases(jobId, cases);
    for (const c of cases) {
      const existing = (await this.repo.listWorkItems(jobId)).filter((w) => w.caseKey === c.caseKey);
      if (existing.length > 0) continue;
      const items = materializeCaseWorkItems(job, c, approved.workflow, approved.record.hash, now);
      for (const item of items) {
        const ready =
          item.dependencies.length === 0 ? reduceWorkItem(item, { type: "mark_ready" }, now) : item;
        await this.repo.saveWorkItem(ready);
      }
    }
  }

  async activateRevision(jobId: string, draft: unknown, migration: RevisionMigration): Promise<void> {
    const job = await this.requireJob(jobId);
    const nextVersion = (job.activeSpecVersion ?? job.draftSpecVersion) + 1;
    const compiled = proposeStrict({ ...asObject(draft), jobId, version: nextVersion });
    const now = new Date().toISOString();
    const record: SpecVersion = {
      jobId,
      version: nextVersion,
      status: "approved",
      hash: compiled.hash,
      canonicalBytes: compiled.canonicalBytes,
      createdAt: now,
      approvedAt: now,
    };
    await this.repo.activateRevision({
      jobId,
      newSpec: record,
      workflow: compiled.spec,
      migration,
      nowIso: now,
    });
  }

  async cancel(command: CancelJobCommand) {
    return this.repo.cancelJob(command.jobId, new Date().toISOString());
  }

  async cancelWorkItem(command: CancelWorkItemCommand) {
    const item = await this.repo.getWorkItem(command.workItemId);
    if (!item || item.jobId !== command.jobId) throw new DomainError("missing_work", command.workItemId);
    const now = new Date().toISOString();
    await this.repo.saveWorkItem(reduceWorkItem(item, { type: "cancel" }, now));
  }

  async tick(jobId: string): Promise<TickReport> {
    return dispatchDueJob({ repo: this.repo, jobId, host: this.hostFactory() });
  }

  async tickDue(maxJobs?: number): Promise<TickReport[]> {
    return dispatchDueScan({ repo: this.repo, host: this.hostFactory(), maxJobs });
  }

  async status(jobId: string) {
    const job = await this.requireJob(jobId);
    const humans = await this.repo.listHumans(jobId);
    const host = this.hostFactory();
    const workItems = await this.repo.listWorkItems(jobId);
    const eligible = workItems.some((w) => w.status === "ready");
    return {
      job,
      display: deriveDisplayStatus({
        job,
        openHumanRequests: humans,
        runtimeUnavailable: eligible && !host?.available,
        nothingEligible: job.lifecycle === "active" && !eligible,
      }),
      humanCount: humans.filter((h) => h.status === "waiting" || h.status === "ready").length,
    };
  }

  async authorizeEffect(jobId: string, intent: EffectIntent) {
    const approved = await this.repo.getApprovedSpec(jobId);
    if (!approved) throw new DomainError("no_approved_spec", jobId);
    return decideEffectAuthorization(approved.workflow.effectEnvelope, intent, {}, new Date().toISOString());
  }

  async prepareAndDispatchEffect(input: {
    jobId: string;
    workItemId: string;
    kind: string;
    identityKey: string;
    attemptId?: string;
    crashAfterDispatch?: boolean;
  }) {
    const now = new Date().toISOString();
    let effect = createEffect(
      {
        id: newId("eff"),
        jobId: input.jobId,
        workItemId: input.workItemId,
        attemptId: input.attemptId,
        kind: input.kind,
        identityKey: input.identityKey,
      },
      now,
    );
    await this.repo.saveEffect(effect);
    effect = reduceEffect(effect, { type: "dispatch", at: now });
    await this.repo.consumeGrant({
      jobId: input.jobId,
      grantId: "manual",
      effect,
    });
    if (input.crashAfterDispatch) {
      effect = reduceEffect(effect, { type: "mark_uncertain" });
      await this.repo.saveEffect(effect);
    }
    return effect;
  }

  async openChallenge(input: {
    jobId: string;
    workItemId: string;
    resourceKey: string;
    reason: string;
    confidence: number;
  }) {
    const approved = await this.repo.getApprovedSpec(input.jobId);
    const threshold = approved?.workflow.challengePolicy.highConfidenceThreshold ?? 0.8;
    if (input.confidence < threshold) {
      return undefined;
    }
    const now = new Date().toISOString();
    const human = await this.repo.createHumanRequest({
      id: newId("hum"),
      jobId: input.jobId,
      kind: "challenge",
      status: "waiting",
      perishable: true,
      workItemId: input.workItemId,
      resourceKey: input.resourceKey,
      reason: input.reason,
      handoff: "Headed rehydration required; do not complete from UI checkbox alone.",
      createdAt: now,
      updatedAt: now,
    });
    if (approved?.workflow.challengePolicy.openBreakerOnChallenge) {
      await this.repo.saveResource({
        key: input.resourceKey,
        scope: "host",
        failures: 1,
        circuitOpenUntil: new Date(Date.parse(now) + 60 * 60_000).toISOString(),
        windowActions: 0,
        windowCostUsd: 0,
        updatedAt: now,
      });
    }
    const item = await this.repo.getWorkItem(input.workItemId);
    if (item) {
      await this.repo.saveWorkItem(
        reduceWorkItem(item, { type: "block", checkpoint: { intent: "challenge", evidenceIds: [] } }, now),
      );
    }
    return human;
  }

  async answerHuman(jobId: string, humanId: string, resolution: string, opts?: { verifiedByOracle?: boolean }) {
    const humans = await this.repo.listHumans(jobId);
    const item = humans.find((h) => h.id === humanId);
    if (!item) throw new DomainError("missing_human", humanId);
    const now = new Date().toISOString();
    if (item.perishable && !opts?.verifiedByOracle) {
      throw new DomainError("rehydration_required", "UI resolve alone cannot complete perishable human work");
    }
    await this.repo.saveHuman({
      ...item,
      status: "resolved",
      resolution,
      resolvedAt: now,
      updatedAt: now,
    });
    if (item.workItemId) {
      const work = await this.repo.getWorkItem(item.workItemId);
      if (work && work.status === "blocked") {
        await this.repo.saveWorkItem(reduceWorkItem(work, { type: "unblock" }, now));
      }
    }
  }

  async skipHuman(jobId: string, humanId: string): Promise<HumanRequest> {
    const humans = await this.repo.listHumans(jobId);
    const item = humans.find((h) => h.id === humanId);
    if (!item) throw new DomainError("missing_human", humanId);
    const now = new Date().toISOString();
    const next: HumanRequest = {
      ...item,
      status: "skipped",
      resolution: "skipped",
      resolvedAt: now,
      updatedAt: now,
    };
    await this.repo.saveHuman(next);
    await this.repo.appendAudit({
      jobId,
      at: now,
      type: "challenge_handoff",
      payload: {
        phase: "skip",
        humanId,
        blockedMs: blockedMsSince(item.createdAt, now),
      },
    });
    return next;
  }

  async prepareHuman(jobId: string, itemId?: string): Promise<HumanRequest> {
    const humans = await this.repo.listHumans(jobId);
    const open = humans.filter((h) => h.status === "waiting" || h.status === "expired" || h.status === "ready");
    const item = itemId ? open.find((h) => h.id === itemId) : open[0];
    if (!item) throw new DomainError("missing_human", itemId ?? "next");
    const now = new Date().toISOString();
    const next: HumanRequest = { ...item, status: "rehydrating", updatedAt: now };
    await this.repo.saveHuman(next);

    const host = this.hostFactory();
    if (item.perishable && host?.challenge) {
      const obs = await host.challenge.observe(item.checkpoint?.pageIdentity).catch(() => undefined);
      if (obs) {
        const detection = detectChallenge(obs);
        if (detection.confidence === "high_confidence") {
          await host.challenge.takeover?.({ host: detection.host }).catch(() => undefined);
        }
      }
    }
    return next;
  }

  async resumeChallenge(jobId: string, humanId: string): Promise<ChallengeResumeResult> {
    const humans = await this.repo.listHumans(jobId);
    const item = humans.find((h) => h.id === humanId);
    if (!item) throw new DomainError("missing_human", humanId);
    if (item.kind !== "challenge") throw new DomainError("not_challenge", humanId);

    const host = this.hostFactory();
    const obs = await host?.challenge?.observe(item.checkpoint?.pageIdentity);
    if (!obs || (typeof obs.url !== "string" && typeof obs.title !== "string")) {
      return { status: "expired_tab", human: item };
    }

    const detection = detectChallenge(obs);
    if (detection.confidence === "high_confidence") {
      await host?.challenge?.takeover?.({ host: detection.host }).catch(() => undefined);
      return { status: "still_blocked", human: item, detection };
    }

    const hash = evidenceHashOf(detection, obs.url);
    const resume = sharedChallengeCoordinator().tryResume(item.resourceKey, hash);
    if (!resume.ok) {
      return { status: "still_blocked", human: item, detection };
    }

    const checkpoint = item.checkpoint ?? { intent: "attempt", evidenceIds: [] };
    let redrive: OperationOutcome<unknown> | undefined;
    if (host?.challenge?.redrive) {
      redrive = await host.challenge.redrive({ intent: checkpoint.intent, checkpoint });
      if (redrive.status === "blocked") {
        return { status: "still_blocked", human: item, detection, redrive };
      }
    }

    const now = new Date().toISOString();
    const blockedMs = blockedMsSince(item.createdAt, now);
    await this.repo.saveHuman({
      ...item,
      status: "resolved",
      resolution: "fresh observation; challenge cleared",
      resolvedAt: now,
      updatedAt: now,
    });
    if (item.workItemId) {
      const work = await this.repo.getWorkItem(item.workItemId);
      if (work && work.status === "blocked") {
        await this.repo.saveWorkItem(reduceWorkItem(work, { type: "retry" }, now));
      }
    }
    await this.repo.appendAudit({
      jobId,
      at: now,
      type: "challenge_handoff",
      payload: { phase: "resume", humanId, blockedMs },
    });
    return { status: "resumed", human: { ...item, status: "resolved" }, detection, redrive };
  }

  private async requireJob(jobId: string): Promise<Job> {
    const job = await this.repo.getJob(jobId);
    if (!job) throw new DomainError("missing_job", jobId);
    return job;
  }
}

function asObject(draft: unknown): Record<string, unknown> {
  return draft && typeof draft === "object" && !Array.isArray(draft) ? (draft as Record<string, unknown>) : {};
}

function blockedMsSince(fromIso: string, toIso: string): number | undefined {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return undefined;
  return to - from;
}

export { hashCanonicalBytes };

export type ChallengeResumeResult =
  | { status: "resumed"; human: HumanRequest; detection: ChallengeDetection; redrive?: OperationOutcome<unknown> }
  | { status: "still_blocked"; human: HumanRequest; detection: ChallengeDetection; redrive?: OperationOutcome<unknown> }
  | { status: "expired_tab"; human: HumanRequest };
