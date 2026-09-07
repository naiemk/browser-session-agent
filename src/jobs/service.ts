import { systemClock, type Clock } from "../core/clock.ts";
import { coreRoot } from "../core/paths.ts";
import { PlanStore } from "../core/plan.ts";
import { GoalStore } from "../core/state.ts";
import { TaskStore } from "../core/task.ts";
import { CoreError } from "../core/types.ts";
import { standingJobPrompt } from "./context.ts";
import { materializePlan } from "./graph.ts";
import { tick, runUntilIdle, type TickOptions, type TickResult } from "./runner.ts";
import { assertReady, mergeSpec, normalizeSpec, specHash } from "./spec.ts";
import { JobStore, listJobs, resolveJobId, type JobSummary } from "./store.ts";
import { JOB_SCHEMA, type HumanItem, type SpecRecord } from "./types.ts";

export interface ServiceOptions {
  root?: string;
  clock?: Clock;
}

export class JobService {
  readonly root: string;
  readonly clock: Clock;

  constructor(options: ServiceOptions = {}) {
    this.root = options.root ?? coreRoot();
    this.clock = options.clock ?? systemClock;
  }

  async create(objective: string, title?: string): Promise<JobStore> {
    if (!objective.trim()) throw new CoreError("bad_job", "objective is required");
    return JobStore.create(this.root, { objective, title }, this.clock);
  }

  async list(): Promise<JobSummary[]> {
    return listJobs(this.root);
  }

  async resolve(query: string): Promise<JobStore> {
    const jobs = await this.list();
    const jobId = resolveJobId(
      jobs.map((job) => job.jobId),
      query,
    );
    return JobStore.open(this.root, jobId, this.clock);
  }

  async updateDraft(jobId: string, patch: object): Promise<SpecRecord> {
    const store = await this.resolve(jobId);
    const job = await store.readJob();
    if (job.status !== "planning" && job.status !== "awaiting_plan_approval") {
      throw new CoreError("not_planning", "draft updates are only allowed while planning");
    }
    const draft = await store.draftSpec();
    const merged = mergeSpec(draft, patch, this.clock);
    await store.writeSpec(merged);
    if (job.status === "awaiting_plan_approval") await store.transition("planning");
    return merged;
  }

  async proposePlan(jobId: string): Promise<SpecRecord> {
    const store = await this.resolve(jobId);
    const draft = await store.draftSpec();
    const normalized = normalizeSpec({
      ...draft,
      status: "draft",
      hash: undefined,
      approvedAt: undefined,
    });
    await store.writeSpec(normalized);
    try {
      assertReady(normalized);
    } catch (err) {
      if (err instanceof CoreError) throw err;
      throw new CoreError(
        "spec_not_ready",
        err instanceof Error ? err.message : String(err),
        { issues: [{ code: "invalid_spec", message: err instanceof Error ? err.message : String(err) }] },
      );
    }
    const hashed: SpecRecord = {
      ...normalized,
      status: "proposed",
      hash: specHash(normalized),
      updatedAt: new Date(this.clock.nowMs()).toISOString(),
    };
    await store.writeSpec(hashed);
    await store.transition("awaiting_plan_approval");
    return hashed;
  }

  async approvePlan(jobId: string, expectedHash: string): Promise<SpecRecord> {
    const store = await this.resolve(jobId);
    const spec = await store.draftSpec();
    if (spec.status !== "proposed" || !spec.hash) {
      throw new CoreError("not_proposed", "propose the plan before approving it");
    }
    if (spec.hash !== expectedHash) {
      throw new CoreError("hash_mismatch", `expected ${expectedHash}, spec is ${spec.hash}`);
    }
    const approved: SpecRecord = {
      ...spec,
      status: "approved",
      approvedAt: new Date(this.clock.nowMs()).toISOString(),
    };
    await store.writeSpec(approved);
    const job = await store.readJob();
    const plan = await PlanStore.open(this.root, store.jobId, job.objective);
    const tasks = await TaskStore.open(this.root, store.jobId);
    const goals = await GoalStore.open(this.root, store.jobId, job.objective);
    const existing = await plan.read();
    if (existing.tasks.length === 0) await materializePlan(plan, tasks, approved, goals);
    await store.transition("active", {
      approvedSpecVersion: approved.version,
      approvedSpecHash: approved.hash,
    });
    return approved;
  }

  async revise(jobId: string): Promise<SpecRecord> {
    const store = await this.resolve(jobId);
    const current = (await store.approvedSpec()) ?? (await store.draftSpec());
    const next: SpecRecord = {
      ...current,
      version: current.version + 1,
      status: "draft",
      hash: undefined,
      approvedAt: undefined,
      schemaVersion: JOB_SCHEMA,
      createdAt: new Date(this.clock.nowMs()).toISOString(),
      updatedAt: new Date(this.clock.nowMs()).toISOString(),
    };
    await store.writeSpec(next);
    if (current.status === "approved") {
      await store.writeSpec({ ...current, status: "superseded" });
    }
    await store.transition("planning", { draftSpecVersion: next.version });
    return next;
  }

  async pause(jobId: string) {
    return (await this.resolve(jobId)).transition("paused");
  }

  async resume(jobId: string) {
    return (await this.resolve(jobId)).transition("active");
  }

  async rename(jobId: string, title: string) {
    return (await this.resolve(jobId)).rename(title);
  }

  async tick(options: Omit<TickOptions, "root" | "clock"> & { jobId: string }): Promise<TickResult> {
    return tick({ ...options, root: this.root, clock: this.clock });
  }

  async run(options: Omit<TickOptions, "root" | "clock"> & { jobId: string; maxTicks?: number }) {
    return runUntilIdle({ ...options, root: this.root, clock: this.clock });
  }

  async tickDue(options: Omit<TickOptions, "root" | "clock" | "jobId"> & { maxJobs?: number } = {}) {
    const now = new Date(this.clock.nowMs()).toISOString();
    const jobs = (await this.list()).filter(
      (job) => job.status === "active" && (!job.nextWakeAt || job.nextWakeAt <= now),
    );
    const results: TickResult[] = [];
    for (const job of jobs.slice(0, options.maxJobs ?? 20)) {
      const result = await this.tick({ ...options, jobId: job.jobId });
      results.push(result);
      if (result.status === "busy") break;
    }
    return results;
  }

  async inbox(jobId: string): Promise<HumanItem[]> {
    const store = await this.resolve(jobId);
    return store.listHuman();
  }

  async answerHuman(jobId: string, humanId: string, resolution: string): Promise<HumanItem> {
    const store = await this.resolve(jobId);
    const items = await store.listHuman();
    const item = items.find((entry) => entry.id === humanId);
    if (!item) throw new CoreError("missing_human", `No inbox item ${humanId}`);
    const next: HumanItem = {
      ...item,
      status: "resolved",
      resolution,
      resolvedAt: new Date(this.clock.nowMs()).toISOString(),
      updatedAt: new Date(this.clock.nowMs()).toISOString(),
    };
    await store.writeHuman(next);
    if (item.taskId) {
      const plan = await PlanStore.open(this.root, store.jobId);
      await plan.markPending(item.taskId);
    }
    if (item.entityId) {
      const goals = await GoalStore.open(this.root, store.jobId);
      await goals.unpark(item.entityId).catch(() => undefined);
    }
    return next;
  }

  async prepareHuman(jobId: string, itemId?: string): Promise<HumanItem> {
    const store = await this.resolve(jobId);
    const items = await store.listHuman();
    const open = items.filter((item) => item.status === "waiting" || item.status === "expired");
    const item = itemId ? open.find((entry) => entry.id === itemId) : open[0];
    if (!item) throw new CoreError("missing_human", "No waiting human items");
    const next: HumanItem = {
      ...item,
      status: "human_ready",
      expiresAt: new Date(this.clock.nowMs() + 10 * 60_000).toISOString(),
      updatedAt: new Date(this.clock.nowMs()).toISOString(),
    };
    await store.writeHuman(next);
    return next;
  }

  async injection(jobId: string, skillsRoot?: string): Promise<string> {
    const store = await this.resolve(jobId);
    const job = await store.readJob();
    const spec = await store.approvedSpec();
    const sprint = await store.tryReadSprint(job.currentSprintId);
    const humans = await store.listHuman();
    return standingJobPrompt({
      status: job.status,
      spec,
      sprint,
      title: job.title,
      jobId: job.jobId,
      humanCount: humans.filter((item) => item.status === "waiting" || item.status === "human_ready").length,
      skillsRoot,
    });
  }
}
