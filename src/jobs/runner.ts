import path from "node:path";
import type { BrowserPort } from "../core/browser.ts";
import { iso, systemClock, type Clock } from "../core/clock.ts";
import { evaluateTask } from "../core/evaluator.ts";
import type { GateGrant } from "../core/gate.ts";
import { shortId } from "../core/ids.ts";
import { acquireLease, type Lease } from "../core/lease.ts";
import { Ledger } from "../core/ledger.ts";
import { browserLockDir, goalPaths } from "../core/paths.ts";
import { PlanStore, type PlanTask } from "../core/plan.ts";
import { verify } from "../core/predicates.ts";
import { GoalStore } from "../core/state.ts";
import { TaskStore } from "../core/task.ts";
import type { ParkedOutcome } from "../core/types.ts";
import { evidenceForGoal } from "../host/evidence.ts";
import { FilePayloadLog, FileRecorder } from "../optimize/recorder.ts";
import { NO_METRICS, NO_PAYLOADS } from "../runtime/metrics.ts";
import type { ModelPort } from "../runtime/model.ts";
import { runTask } from "../runtime/runtime.ts";
import { discoverFromTemplate, ensureOracle, materializePlan } from "./graph.ts";
import {
  addSpend,
  budgetExhausted,
  clampRetryMs,
  consumeGrant,
  earliestWake,
  recordFailure,
  recordSuccess,
  remainingGrant,
  resourceBlocked,
  withJitter,
} from "./scheduler.ts";
import { createSprint, refreshSprint, sprintNeedsRollover } from "./sprint.ts";
import { JobStore } from "./store.ts";
import type { HumanItem, HumanKind, SpecRecord, SprintRecord } from "./types.ts";

export type TickStatus =
  | "worked"
  | "idle"
  | "waiting_human"
  | "busy"
  | "paused"
  | "complete"
  | "failed";

export interface TickResult {
  status: TickStatus;
  jobId: string;
  taskId?: string;
  detail?: string;
  nextWakeAt?: string;
  humanCount?: number;
}

export interface TickOptions {
  root: string;
  jobId: string;
  clock?: Clock;
  owner?: string;
  ttlMs?: number;
  stream?: ModelPort;
  browser?: BrowserPort;
  tabId?: string;
  jitter?: (unit: number) => number;
  leaseRoot?: string;
}

const LEASE_TTL = 120_000;

async function withLeases<T>(
  root: string,
  jobId: string,
  owner: string,
  ttlMs: number,
  clock: Clock,
  needBrowser: boolean,
  fn: () => Promise<T>,
): Promise<T | TickResult> {
  let browserLease: Lease | undefined;
  if (needBrowser) {
    browserLease = await acquireLease(browserLockDir(root), { owner, ttlMs, clock });
    if (!browserLease) {
      return { status: "busy", jobId, detail: "browser lease held" };
    }
  }
  const jobLease = await acquireLease(path.join(goalPaths(root, jobId).locksDir, "job"), {
    owner,
    ttlMs,
    clock,
  });
  if (!jobLease) {
    await browserLease?.release();
    return { status: "busy", jobId, detail: "job lease held" };
  }
  try {
    return await fn();
  } finally {
    await jobLease.release().catch(() => undefined);
    await browserLease?.release().catch(() => undefined);
  }
}

export async function tick(options: TickOptions): Promise<TickResult> {
  const clock = options.clock ?? systemClock;
  const owner = options.owner ?? `pid-${process.pid}`;
  const ttlMs = options.ttlMs ?? LEASE_TTL;
  const store = await JobStore.open(options.root, options.jobId, clock);
  const job = await store.readJob();
  if (job.status === "paused") return { status: "paused", jobId: job.jobId };
  if (job.status === "completed") return { status: "complete", jobId: job.jobId };
  if (job.status === "cancelled" || job.status === "failed") {
    return { status: "failed", jobId: job.jobId, detail: job.status };
  }
  if (job.status !== "active") {
    return { status: "idle", jobId: job.jobId, detail: job.status };
  }

  const willRun = Boolean(options.stream && options.browser);
  const result = await withLeases(options.root, job.jobId, owner, ttlMs, clock, willRun, async () => {
    return runLocked(store, options, clock);
  });
  return result;
}

async function runLocked(store: JobStore, options: TickOptions, clock: Clock): Promise<TickResult> {
  const job = await store.readJob();
  const spec = await store.approvedSpec();
  if (!spec?.hash) {
    return { status: "failed", jobId: job.jobId, detail: "no approved spec" };
  }
  const plan = await PlanStore.open(store.root, store.jobId, job.objective);
  const tasks = await TaskStore.open(store.root, store.jobId);
  const goals = await GoalStore.open(store.root, store.jobId, job.objective);
  const humans = await store.listHuman();
  let scheduler = await store.readScheduler();
  const now = iso(clock);

  await recoverRunning(plan, tasks, options.browser, options.tabId, now);
  await expireHumans(store, humans, now, clock);
  const freshHumans = await store.listHuman();
  await wakeDue(plan, now);
  await failExhausted(plan);

  const exhausted = budgetExhausted(scheduler, spec);
  if (exhausted) {
    await store.transition("failed");
    return { status: "failed", jobId: job.jobId, detail: exhausted };
  }

  const settled = await terminalStatus(plan);
  if (settled === "complete") {
    await store.transition("completed");
    return { status: "complete", jobId: job.jobId };
  }
  if (settled === "failed") {
    await store.transition("failed");
    return { status: "failed", jobId: job.jobId, detail: "a task failed permanently" };
  }

  let sprint = await ensureSprint(store, plan, spec, clock);
  sprint = await refreshSprint(store, plan, sprint);

  if (sprintNeedsRollover(sprint) && sprint.status !== "holding") {
    const closed = { ...sprint, status: "closed" as const, closedAt: now };
    await store.writeSprint(closed);
    sprint = await ensureSprint(store, plan, spec, clock, closed);
    await store.transition("active", { currentSprintId: sprint.id });
  }

  const picked = await pickSprintTask(plan, sprint, scheduler, spec, now);
  const openHumans = freshHumans.filter(
    (item) => item.status === "waiting" || item.status === "human_ready",
  );
  if (!picked) {
    const nextWakeAt = earliestWake([
      ...freshHumans.map((item) => item.notBefore),
      ...freshHumans.map((item) => item.expiresAt),
      job.nextWakeAt,
    ]);
    await store.writeJob({ ...job, nextWakeAt, updatedAt: now });
    return {
      status: openHumans.length > 0 ? "waiting_human" : "idle",
      jobId: job.jobId,
      nextWakeAt,
      humanCount: openHumans.length,
      detail: "nothing runnable",
    };
  }

  if (!options.stream || !options.browser) {
    return { status: "idle", jobId: job.jobId, detail: "no runtime attached", taskId: picked.id };
  }

  let entityId = picked.entityId;
  if (!entityId) {
    const entity = await goals.addEntity({ label: picked.objective });
    entityId = entity.entityId;
    await plan.updateTask(picked.id, { entityId });
  }

  await ensureOracle(plan, tasks, picked.id);
  await plan.markRunning(picked.id);
  await tasks.setStatus(picked.id, "running");

  if (entityId) {
    const entity = await goals.getEntity(entityId);
    if (entity?.journal && (entity.journal.status === "prepared" || entity.journal.status === "fired")) {
      const oracle = await tasks.require(picked.id);
      const facts = await options.browser.facts(options.tabId);
      const verification = verify(oracle.criteria, facts);
      if (verification.status === "passed") {
        await goals.setJournal(entityId, { ...entity.journal, status: "verified", verifiedAt: now });
        await plan.markDone(picked.id);
        await tasks.setStatus(picked.id, "done");
        return { status: "worked", jobId: job.jobId, taskId: picked.id, detail: "reconciled already-done commit" };
      }
    }
  }

  const ledger = await Ledger.open(store.root, store.jobId);
  const metrics = await FileRecorder.open(goalPaths(store.root, store.jobId).metricsFile);
  const payloads = await FilePayloadLog.open(goalPaths(store.root, store.jobId).payloadsFile);
  const grants = toGateGrants(spec, scheduler);

  let parked: ParkedOutcome | undefined;
  const outcome = await runTask({
    card: {
      objective: picked.objective,
      criteria: picked.criteria,
      startUrl: spec.startUrl,
      knownFacts: {
        ...spec.knownFacts,
        ...(picked.lastHandoff ? { lastHandoff: picked.lastHandoff } : {}),
        jobId: job.jobId,
        specHash: spec.hash,
      },
      policy: grants.length > 0 ? "ask" : "ask",
      maxTurns: spec.budgets.maxTurnsPerTask,
    },
    maxTurns: spec.budgets.maxTurnsPerTask,
    stream: options.stream,
    tools: {
      browser: options.browser,
      tabId: options.tabId,
      evidence: evidenceForGoal({
        root: store.root,
        goalId: store.jobId,
        ledger,
        store: goals,
        metrics: metrics ?? NO_METRICS,
        payloads: payloads ?? NO_PAYLOADS,
        entityId,
      }),
      policy: "ask",
      specHash: spec.hash,
      grants,
      neverPreapprove: spec.approvalEnvelope.neverPreapprove,
      claim: entityId
        ? async (key) => {
            const entity = await goals.requireEntity(entityId);
            if (entity.journal?.status === "verified") return false;
            await goals.setJournal(entityId, {
              actionId: key,
              idempotencyKey: key,
              kind: "commit",
              status: "prepared",
              preparedAt: iso(clock),
            });
            return goals.claim(entityId, key);
          }
        : undefined,
      onGrantUsed: async (grantId) => {
        scheduler = consumeGrant(scheduler, grantId);
        await store.writeScheduler(scheduler);
      },
      onParked: (value) => {
        parked = value;
      },
      onDiscover: async ({ templateId, entities }) => {
        try {
          const created = await discoverFromTemplate(plan, tasks, goals, spec, picked.id, templateId, entities);
          return { created: created.length };
        } catch (err) {
          return { created: 0, error: err instanceof Error ? err.message : String(err) };
        }
      },
      approve: async () => false,
    },
  });

  parked = parked ?? outcome.parked;
  const evaluation = await evaluateTask({
    store: tasks,
    taskId: picked.id,
    browser: options.browser,
    ledger,
    tabId: options.tabId,
    claim: outcome.report?.summary,
    capped: outcome.capped,
    parked,
    declined: outcome.declined,
    sessionError: outcome.error ?? outcome.modelErrors[0],
  });

  scheduler = addSpend(scheduler, { costUsd: outcome.costUsd, attempts: 1, siteActions: outcome.toolCalls });
  await store.writeScheduler(scheduler);

  if (evaluation.status === "success") {
    await plan.markDone(picked.id);
    if (picked.resource) {
      scheduler = recordSuccess(scheduler, picked.resource);
      await store.writeScheduler(scheduler);
    }
    if (entityId) {
      const entity = await goals.getEntity(entityId);
      if (entity?.journal) {
        await goals.setJournal(entityId, { ...entity.journal, status: "verified", verifiedAt: iso(clock) });
      }
      await goals.finish(entityId, { status: "success", detail: evaluation.verification.status });
    }
    sprint = await refreshSprint(store, plan, sprint);
    return { status: "worked", jobId: job.jobId, taskId: picked.id, detail: "success" };
  }

  if (evaluation.status === "needs_user_input" || parked) {
    const missing = evaluation.status === "needs_user_input" ? evaluation.missingInputs[0] : undefined;
    const item = await parkTask(
      store,
      plan,
      goals,
      spec,
      { ...picked, entityId },
      parked,
      missing,
      clock,
      options.jitter,
    );
    scheduler = recordFailure(
      scheduler,
      item.resource,
      spec,
      clock,
      clampRetryMs(parked?.recommendedRetryMs, spec),
    );
    await store.writeScheduler(scheduler);
    sprint = await refreshSprint(store, plan, sprint, { blockers: [...sprint.blockers, item.reason] });
    return {
      status: "waiting_human",
      jobId: job.jobId,
      taskId: picked.id,
      detail: item.reason,
      humanCount: 1,
      nextWakeAt: item.notBefore,
    };
  }

  if (evaluation.status === "replan") {
    await plan.replaceApproach({
      reason: evaluation.reason,
      abandon: picked.approach,
    });
    sprint = await refreshSprint(store, plan, sprint, {
      failedApproaches: [...sprint.failedApproaches, { approach: picked.approach ?? picked.id, reason: evaluation.reason }],
    });
    return { status: "worked", jobId: job.jobId, taskId: picked.id, detail: "replan" };
  }

  const cap = picked.maxAttempts ?? (await plan.read()).maxAttemptsPerTask;
  const current = await plan.requireTask(picked.id);
  if (current.attempts >= cap || evaluation.status === "fatal") {
    const reason =
      evaluation.status === "fatal" || evaluation.status === "retry"
        ? evaluation.reason
        : "attempts exhausted";
    await plan.markFailed(picked.id, reason);
    const settledAfter = await terminalStatus(plan);
    if (settledAfter === "failed") {
      await store.transition("failed");
      return { status: "failed", jobId: job.jobId, taskId: picked.id, detail: reason };
    }
    return { status: "worked", jobId: job.jobId, taskId: picked.id, detail: "failed permanently" };
  }
  await plan.markPending(picked.id);
  return { status: "worked", jobId: job.jobId, taskId: picked.id, detail: evaluation.status };
}

async function terminalStatus(plan: PlanStore): Promise<"complete" | "failed" | undefined> {
  const record = await plan.read();
  if (record.tasks.length === 0) return undefined;
  const open = record.tasks.some((task) =>
    task.status === "pending" ||
    task.status === "running" ||
    task.status === "blocked" ||
    task.status === "parked",
  );
  if (open) return undefined;
  if (record.tasks.some((task) => task.status === "failed")) return "failed";
  return "complete";
}

async function failExhausted(plan: PlanStore): Promise<void> {
  const record = await plan.read();
  const defaultCap = record.maxAttemptsPerTask ?? 3;
  for (const task of record.tasks) {
    const cap = task.maxAttempts ?? defaultCap;
    if (
      (task.status === "pending" || task.status === "parked") &&
      task.attempts >= cap
    ) {
      await plan.markFailed(task.id, "attempts exhausted");
    }
  }
}

async function recoverRunning(
  plan: PlanStore,
  tasks: TaskStore,
  browser: BrowserPort | undefined,
  tabId: string | undefined,
  now: string,
): Promise<void> {
  const record = await plan.read();
  for (const task of record.tasks.filter((entry) => entry.status === "running")) {
    if (browser) {
      const oracle = await tasks.get(task.id);
      if (oracle) {
        const facts = await browser.facts(tabId);
        if (verify(oracle.criteria, facts).status === "passed") {
          await plan.markDone(task.id);
          await tasks.setStatus(task.id, "done");
          continue;
        }
      }
    }
    await plan.updateTask(task.id, { status: "pending", lastHandoff: `interrupted at ${now}` });
    await tasks.setStatus(task.id, "pending");
  }
}

async function expireHumans(store: JobStore, humans: HumanItem[], now: string, clock: Clock): Promise<void> {
  for (const item of humans) {
    if (item.status === "human_ready" && item.expiresAt && item.expiresAt <= now) {
      await store.writeHuman({
        ...item,
        status: item.perishable ? "expired" : "waiting",
        updatedAt: iso(clock),
      });
    }
  }
}

async function wakeDue(plan: PlanStore, now: string): Promise<void> {
  const record = await plan.read();
  for (const task of record.tasks) {
    if (task.status === "parked" && task.deferredUntil && task.deferredUntil <= now) {
      await plan.markPending(task.id);
    }
  }
}

async function ensureSprint(
  store: JobStore,
  plan: PlanStore,
  spec: SpecRecord,
  clock: Clock,
  previous?: SprintRecord,
): Promise<SprintRecord> {
  const job = await store.readJob();
  const existing = await store.tryReadSprint(job.currentSprintId);
  const readyAll = await plan.readyTasks(iso(clock));
  if (existing && existing.status === "open") return existing;
  if (existing && existing.status === "holding" && readyAll.length === 0 && !previous) return existing;
  const ready = readyAll.slice(0, spec.budgets.sprintTaskLimit);
  const sprint = await createSprint(store, spec, ready, clock, {
    decisions: previous?.decisions ?? existing?.decisions ?? [],
    facts: previous?.facts ?? existing?.facts ?? {},
    failedApproaches: previous?.failedApproaches ?? existing?.failedApproaches ?? [],
    summary: previous
      ? `After ${previous.id}: ${previous.progress.done} done. Next ${ready.length} task(s).`
      : undefined,
  });
  for (const task of ready) {
    await plan.updateTask(task.id, { sprintId: sprint.id });
  }
  await store.transition("active", { currentSprintId: sprint.id });
  return sprint;
}

async function pickSprintTask(
  plan: PlanStore,
  sprint: SprintRecord,
  scheduler: Awaited<ReturnType<JobStore["readScheduler"]>>,
  _spec: SpecRecord,
  now: string,
): Promise<PlanTask | undefined> {
  const ready = await plan.readyTasks(now);
  const candidates =
    sprint.status === "open" && sprint.taskIds.length > 0
      ? ready.filter((task) => sprint.taskIds.includes(task.id))
      : ready;
  return candidates.find((task) => !task.resource || !resourceBlocked(scheduler, task.resource, now));
}

function toGateGrants(spec: SpecRecord, scheduler: Awaited<ReturnType<JobStore["readScheduler"]>>): GateGrant[] {
  return spec.approvalEnvelope.grants.map((grant) => ({
    id: grant.id,
    specHash: spec.hash ?? "",
    host: grant.host,
    authorization: grant.gateClass,
    controlKind: grant.controlKind,
    controlName: grant.controlName,
    remaining: remainingGrant(scheduler, grant.id, grant.maxCount),
    expiresAt: grant.expiresAt,
  }));
}

async function parkTask(
  store: JobStore,
  plan: PlanStore,
  goals: GoalStore,
  spec: SpecRecord,
  task: PlanTask,
  parked: ParkedOutcome | undefined,
  missing: string | undefined,
  clock: Clock,
  jitter?: (unit: number) => number,
): Promise<HumanItem> {
  const reason = parked?.reason ?? missing ?? "needs human input";
  const perishable = parked?.perishable ?? false;
  const kind = (parked?.payload?.kind as HumanKind | undefined) ?? (perishable ? "challenge" : "decision");
  const resource =
    (parked?.payload?.resource as string | undefined) ?? task.resource ?? resourceFromUrl(spec.startUrl);
  const retry = withJitter(clampRetryMs(parked?.recommendedRetryMs, spec), jitter);
  const notBefore = new Date(clock.nowMs() + retry).toISOString();
  const item: HumanItem = {
    id: shortId("hum"),
    jobId: store.jobId,
    kind,
    status: "waiting",
    entityId: task.entityId,
    taskId: task.id,
    perishable,
    resource,
    reason,
    handoff: parked?.handoff ?? reason,
    reentry: spec.startUrl,
    payload: parked?.payload,
    recommendedRetryMs: retry,
    notBefore,
    createdAt: iso(clock),
    updatedAt: iso(clock),
  };
  await store.writeHuman(item);
  await plan.markParked(task.id, parked ?? { status: "parked", reason, wake: "human", perishable }, notBefore);
  if (task.entityId) {
    await goals.park(task.entityId, {
      ...(parked ?? { reason, wake: "human", perishable }),
      wakeAt: notBefore,
    });
  }
  return item;
}

function resourceFromUrl(url?: string): string {
  if (!url) return "unknown";
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

export async function runUntilIdle(
  options: TickOptions & { maxTicks?: number },
): Promise<TickResult[]> {
  const results: TickResult[] = [];
  const max = options.maxTicks ?? 20;
  for (let i = 0; i < max; i++) {
    const result = await tick(options);
    results.push(result);
    if (result.status !== "worked") break;
  }
  return results;
}
