import { decideSchedule, type SchedulerView } from "../domain/scheduler-policy.ts";
import { reduceWorkItem } from "../domain/work-item.ts";
import { DomainError } from "../domain/errors.ts";
import type { JobRepository } from "../ports/repository.ts";
import type { ExecutionHost } from "../ports/execution-kernel.ts";
import { compileAttemptContext, evaluateAttemptOutcome, emptyRetryLedger, allowRetry } from "./context-compiler.ts";
import { newId } from "./planning.ts";
import type { DerivedDisplayStatus } from "../domain/types.ts";
import { deriveDisplayStatus } from "./status.ts";

const DEFAULT_TTL_MS = 120_000;

export interface TickReport {
  jobId: string;
  status: DerivedDisplayStatus | "worked" | "complete" | "failed";
  detail?: string;
  workItemId?: string;
  attemptId?: string;
  nextWakeAt?: string;
}

export async function dispatchDueJob(input: {
  repo: JobRepository;
  jobId: string;
  host: ExecutionHost | null;
  ttlMs?: number;
  artifacts?: [];
  acceptedOutputs?: unknown[];
}): Promise<TickReport> {
  const job = await input.repo.getJob(input.jobId);
  if (!job) throw new DomainError("missing_job", input.jobId);
  const nowIso = input.host?.nowIso() ?? new Date().toISOString();
  const approved = await input.repo.getApprovedSpec(input.jobId);
  const workItems = await input.repo.listWorkItems(input.jobId);
  const humans = await input.repo.listHumans(input.jobId);
  const resources = await input.repo.listResources();

  const view: SchedulerView = {
    job,
    workItems,
    humans,
    resources: resources.filter((r) => workItems.some((w) => w.resourceKey === r.key) || true),
    runtimeAvailable: Boolean(input.host?.available),
  };
  const decision = decideSchedule(view, nowIso);

  if (decision.kind === "ineligible") {
    const display = deriveDisplayStatus({
      job,
      runtimeUnavailable: decision.reasons.some((r) => r.code === "runtime_unavailable"),
      openHumanRequests: humans,
      nothingEligible: decision.reasons.some((r) => r.code === "no_ready_work"),
      resourceBlocked: decision.reasons.some((r) => r.code === "resource_breaker" || r.code === "resource_cooldown"),
    });
    if (job.nextWakeAt !== decision.nextWakeAt) {
      await input.repo.saveJob({ ...job, nextWakeAt: decision.nextWakeAt, updatedAt: nowIso });
    }
    return {
      jobId: job.jobId,
      status: display,
      detail: decision.reasons.map((r) => r.code).join(","),
      nextWakeAt: decision.nextWakeAt,
    };
  }

  if (!input.host?.available || !approved) {
    return {
      jobId: job.jobId,
      status: "runtime_unavailable",
      detail: "no execution host or approved spec",
      workItemId: decision.kind === "dispatch" ? decision.workItemId : decision.workItemIds[0],
    };
  }

  const workItemId = decision.kind === "dispatch" ? decision.workItemId : decision.workItemIds[0]!;
  const fenceToken = newId("fence");
  const attemptId = newId("att");
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  const leaseExpiresAt = new Date(Date.parse(nowIso) + ttl).toISOString();

  const attempt = await input.repo.claimWork({
    workItemId,
    attemptId,
    fenceToken,
    leaseExpiresAt,
    nowIso,
  });

  const heartbeat = setInterval(() => {
    const nextExpiry = new Date(Date.now() + ttl).toISOString();
    void input.repo.heartbeat({ attemptId, fenceToken, leaseExpiresAt: nextExpiry }).catch(() => undefined);
  }, Math.max(1_000, Math.floor(ttl / 3)));

  try {
    const item = (await input.repo.getWorkItem(workItemId))!;
    const caseRecord = item.caseKey
      ? (await input.repo.listCases(job.jobId)).find((c) => c.caseKey === item.caseKey)
      : undefined;
    const compiled = compileAttemptContext({
      workItem: item,
      case: caseRecord,
      workflow: approved.workflow,
    });
    const outcome = await input.host.kernel.execute(compiled);
    const cases = await input.repo.listCases(job.jobId);
    const evaluated = evaluateAttemptOutcome({
      workflow: approved.workflow,
      workItem: item,
      output: outcome.status === "completed" ? outcome.value : undefined,
      claim: outcome.status === "completed" ? { success: true } : undefined,
      cases,
      artifacts: input.artifacts ?? [],
      acceptedOutputs: input.acceptedOutputs ?? [],
      nowIso,
    });

    let nextItem = item;
    if (outcome.status === "blocked") {
      nextItem = reduceWorkItem(item, { type: "block", checkpoint: outcome.checkpoint }, nowIso);
    } else if (outcome.status === "cancelled") {
      nextItem = reduceWorkItem(item, { type: "cancel" }, nowIso);
    } else if (outcome.status === "failed") {
      nextItem = reduceWorkItem(item, { type: "fail" }, nowIso);
    } else {
      nextItem = reduceWorkItem(item, { type: "complete" }, nowIso);
    }

    let nextJob = job;
    if (evaluated.jobComplete) {
      const { transitionJobLifecycle } = await import("../domain/job-lifecycle.ts");
      nextJob = transitionJobLifecycle(job, "completed", nowIso);
    }

    await input.repo.commitOutcome({
      attemptId: attempt.id,
      fenceToken,
      workItem: { ...nextItem, status: evaluated.workItemStatus === "done" ? nextItem.status : nextItem.status },
      job: nextJob,
      outcome,
      finishedAt: nowIso,
    });

    return {
      jobId: job.jobId,
      status: evaluated.jobComplete ? "complete" : "worked",
      workItemId,
      attemptId: attempt.id,
    };
  } finally {
    clearInterval(heartbeat);
  }
}

export async function dispatchDueScan(input: {
  repo: JobRepository;
  host: ExecutionHost | null;
  maxJobs?: number;
}): Promise<TickReport[]> {
  const jobs = (await input.repo.listJobs()).filter((j) => j.lifecycle === "active");
  const reports: TickReport[] = [];
  for (const job of jobs.slice(0, input.maxJobs ?? 20)) {
    const report = await dispatchDueJob({ repo: input.repo, jobId: job.jobId, host: input.host });
    reports.push(report);
    // SCHED-08: continue past busy / lease conflicts
    if (report.status === "running") continue;
  }
  return reports;
}

export { emptyRetryLedger, allowRetry, DEFAULT_TTL_MS };
