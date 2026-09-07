import { readdir } from "node:fs/promises";
import path from "node:path";
import { assertSchemaVersion, readJsonFile, writeJsonAtomic } from "../core/atomic.ts";
import { iso, systemClock, type Clock } from "../core/clock.ts";
import { shortId } from "../core/ids.ts";
import { coreRoot, ensureGoalDirs, goalPaths } from "../core/paths.ts";
import { redactDeep } from "../core/redact.ts";
import { GoalStore } from "../core/state.ts";
import { CoreError } from "../core/types.ts";
import { emptySpec, writeSpecFiles } from "./spec.ts";
import {
  JOB_SCHEMA,
  LEGAL_TRANSITIONS,
  type HumanItem,
  type JobDisplayStatus,
  type JobDurableStatus,
  type JobRecord,
  type SchedulerRecord,
  type SpecRecord,
  type SprintRecord,
} from "./types.ts";

export interface JobSummary {
  jobId: string;
  title: string;
  objective: string;
  status: JobDurableStatus;
  display: JobDisplayStatus;
  humanCount: number;
  nextWakeAt?: string;
  updatedAt: string;
  approvedSpecHash?: string;
}

function emptyScheduler(clock: Clock): SchedulerRecord {
  return {
    schemaVersion: JOB_SCHEMA,
    resources: {},
    grantUsage: {},
    spend: { costUsd: 0, attempts: 0, siteActions: 0 },
    updatedAt: iso(clock),
  };
}

export class JobStore {
  private constructor(
    readonly root: string,
    readonly jobId: string,
    private readonly clock: Clock,
  ) {}

  static async open(root: string, jobId: string, clock: Clock = systemClock): Promise<JobStore> {
    const paths = goalPaths(root, jobId);
    await ensureGoalDirs(paths);
    return new JobStore(root, jobId, clock);
  }

  static async create(
    root: string,
    input: { objective: string; title?: string; jobId?: string },
    clock: Clock = systemClock,
  ): Promise<JobStore> {
    const jobId = input.jobId ?? shortId("job");
    const store = await JobStore.open(root, jobId, clock);
    const now = iso(clock);
    const title = input.title?.trim() || input.objective.trim().slice(0, 80) || jobId;
    const job: JobRecord = {
      schemaVersion: JOB_SCHEMA,
      jobId,
      title,
      objective: input.objective.trim(),
      status: "planning",
      draftSpecVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await store.writeJob(job);
    await GoalStore.open(root, jobId, input.objective);
    const spec = emptySpec(jobId, input.objective.trim(), clock);
    await writeSpecFiles(goalPaths(root, jobId).specsDir, spec);
    await store.writeScheduler(emptyScheduler(clock));
    return store;
  }

  paths() {
    return goalPaths(this.root, this.jobId);
  }

  async readJob(): Promise<JobRecord> {
    const record = await readJsonFile<JobRecord>(this.paths().jobFile);
    if (!record) throw new CoreError("missing_job", `No job ${this.jobId}`);
    assertSchemaVersion(record.schemaVersion, JOB_SCHEMA, "job");
    return record;
  }

  async tryReadJob(): Promise<JobRecord | undefined> {
    const record = await readJsonFile<JobRecord>(this.paths().jobFile);
    if (!record) return undefined;
    assertSchemaVersion(record.schemaVersion, JOB_SCHEMA, "job");
    return record;
  }

  async writeJob(job: JobRecord): Promise<void> {
    await writeJsonAtomic(this.paths().jobFile, redactDeep({ ...job, updatedAt: iso(this.clock) }));
  }

  async transition(to: JobDurableStatus, patch: Partial<JobRecord> = {}): Promise<JobRecord> {
    const job = await this.readJob();
    if (job.status === to) {
      const next = { ...job, ...patch, status: to, updatedAt: iso(this.clock) };
      await writeJsonAtomic(this.paths().jobFile, redactDeep(next));
      return next;
    }
    if (!LEGAL_TRANSITIONS[job.status].includes(to)) {
      throw new CoreError("illegal_transition", `cannot move ${this.jobId} from ${job.status} to ${to}`);
    }
    const next: JobRecord = {
      ...job,
      ...patch,
      status: to,
      updatedAt: iso(this.clock),
      pausedAt: to === "paused" ? iso(this.clock) : to === "active" ? undefined : job.pausedAt,
      completedAt: to === "completed" ? iso(this.clock) : job.completedAt,
    };
    await writeJsonAtomic(this.paths().jobFile, redactDeep(next));
    return next;
  }

  async rename(title: string): Promise<JobRecord> {
    const trimmed = title.trim();
    if (!trimmed) throw new CoreError("bad_title", "title cannot be empty");
    const job = await this.readJob();
    const next = { ...job, title: trimmed, updatedAt: iso(this.clock) };
    await writeJsonAtomic(this.paths().jobFile, redactDeep(next));
    return next;
  }

  specPath(version: number): string {
    return path.join(this.paths().specsDir, `${version}.json`);
  }

  async readSpec(version: number): Promise<SpecRecord> {
    const spec = await readJsonFile<SpecRecord>(this.specPath(version));
    if (!spec) throw new CoreError("missing_spec", `No spec v${version} for ${this.jobId}`);
    assertSchemaVersion(spec.schemaVersion, JOB_SCHEMA, "spec");
    return spec;
  }

  async writeSpec(spec: SpecRecord): Promise<void> {
    await writeSpecFiles(this.paths().specsDir, spec);
  }

  async approvedSpec(): Promise<SpecRecord | undefined> {
    const job = await this.readJob();
    if (!job.approvedSpecVersion) return undefined;
    return this.readSpec(job.approvedSpecVersion);
  }

  async draftSpec(): Promise<SpecRecord> {
    const job = await this.readJob();
    return this.readSpec(job.draftSpecVersion);
  }

  async readScheduler(): Promise<SchedulerRecord> {
    const record = await readJsonFile<SchedulerRecord>(this.paths().schedulerFile);
    if (!record) return emptyScheduler(this.clock);
    return record;
  }

  async writeScheduler(record: SchedulerRecord): Promise<void> {
    await writeJsonAtomic(this.paths().schedulerFile, redactDeep({ ...record, updatedAt: iso(this.clock) }));
  }

  async readSprint(id: string): Promise<SprintRecord> {
    const record = await readJsonFile<SprintRecord>(path.join(this.paths().sprintsDir, `${id}.json`));
    if (!record) throw new CoreError("missing_sprint", `No sprint ${id}`);
    return record;
  }

  async tryReadSprint(id: string | undefined): Promise<SprintRecord | undefined> {
    if (!id) return undefined;
    return readJsonFile<SprintRecord>(path.join(this.paths().sprintsDir, `${id}.json`));
  }

  async writeSprint(sprint: SprintRecord): Promise<void> {
    const { writeFile } = await import("node:fs/promises");
    const jsonPath = path.join(this.paths().sprintsDir, `${sprint.id}.json`);
    const mdPath = path.join(this.paths().sprintsDir, `${sprint.id}.md`);
    await writeJsonAtomic(jsonPath, redactDeep(sprint));
    await writeFile(mdPath, renderSprintMarkdown(sprint), "utf8");
  }

  async listHuman(): Promise<HumanItem[]> {
    const names = await readdir(this.paths().humanDir).catch(() => []);
    const items: HumanItem[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const item = await readJsonFile<HumanItem>(path.join(this.paths().humanDir, name));
      if (item) items.push(item);
    }
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async writeHuman(item: HumanItem): Promise<void> {
    await writeJsonAtomic(path.join(this.paths().humanDir, `${item.id}.json`), redactDeep(item));
  }

  async summary(display: JobDisplayStatus = "idle"): Promise<JobSummary> {
    const job = await this.readJob();
    const humans = (await this.listHuman()).filter(
      (item) => item.status === "waiting" || item.status === "human_ready" || item.status === "rehydrating",
    );
    return {
      jobId: job.jobId,
      title: job.title,
      objective: job.objective,
      status: job.status,
      display: humans.length > 0 && job.status === "active" ? "waiting_human" : display,
      humanCount: humans.length,
      nextWakeAt: job.nextWakeAt,
      updatedAt: job.updatedAt,
      approvedSpecHash: job.approvedSpecHash,
    };
  }
}

export function renderSprintMarkdown(sprint: SprintRecord): string {
  return `# Sprint ${sprint.id}

Spec ${sprint.specVersion} \`${sprint.specHash}\` · ${sprint.status}

${sprint.summary}

Done ${sprint.progress.done}/${sprint.progress.total} · parked ${sprint.progress.parked}

## Remaining
${sprint.remaining.map((line) => `- ${line}`).join("\n") || "- (none)"}

## Blockers
${sprint.blockers.map((line) => `- ${line}`).join("\n") || "- (none)"}

## Failed approaches
${sprint.failedApproaches.map((item) => `- ${item.approach}: ${item.reason}`).join("\n") || "- (none)"}
`;
}

export async function listJobs(root = coreRoot()): Promise<JobSummary[]> {
  const dir = path.join(root, "goals");
  const ids = await readdir(dir).catch(() => [] as string[]);
  const rows: JobSummary[] = [];
  for (const jobId of ids) {
    const record = await readJsonFile<JobRecord>(goalPaths(root, jobId).jobFile);
    if (!record) continue;
    try {
      assertSchemaVersion(record.schemaVersion, JOB_SCHEMA, "job");
    } catch {
      continue;
    }
    const store = await JobStore.open(root, jobId);
    rows.push(await store.summary());
  }
  return rows.sort((left, right) => {
    const human = right.humanCount - left.humanCount;
    if (human !== 0) return human;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function resolveJobId(ids: string[], query: string): string {
  if (ids.includes(query)) return query;
  const matches = ids.filter((id) => id.startsWith(query));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new CoreError("ambiguous_job", `id prefix "${query}" matches ${matches.join(", ")}`);
  }
  throw new CoreError("missing_job", `No job ${query}`);
}
