import type {
  Attempt,
  Case,
  Effect,
  HumanRequest,
  Job,
  JobId,
  ResourceState,
  SpecVersion,
  WorkItem,
  WorkItemId,
  FenceToken,
  AttemptId,
  OperationOutcome,
} from "../domain/types.ts";
import type { WorkflowSpecV2 } from "../domain/spec-types.ts";
import type { RevisionMigration } from "../application/revision.ts";

export interface JobRepository {
  createJob(input: {
    jobId?: JobId;
    title: string;
    objective: string;
    caseMode: Job["caseMode"];
  }): Promise<Job>;

  getJob(jobId: JobId): Promise<Job | undefined>;
  listJobs(): Promise<Job[]>;
  saveJob(job: Job): Promise<void>;

  saveSpecVersion(spec: SpecVersion): Promise<void>;
  getSpecVersion(jobId: JobId, version: number): Promise<SpecVersion | undefined>;
  getApprovedSpec(jobId: JobId): Promise<{ record: SpecVersion; workflow: WorkflowSpecV2 } | undefined>;

  upsertCases(jobId: JobId, cases: Case[]): Promise<Case[]>;
  listCases(jobId: JobId): Promise<Case[]>;

  saveWorkItem(item: WorkItem): Promise<void>;
  getWorkItem(id: WorkItemId): Promise<WorkItem | undefined>;
  listWorkItems(jobId: JobId): Promise<WorkItem[]>;

  listHumans(jobId: JobId): Promise<HumanRequest[]>;
  saveHuman(item: HumanRequest): Promise<void>;

  getResource(key: string): Promise<ResourceState | undefined>;
  saveResource(state: ResourceState): Promise<void>;
  listResources(): Promise<ResourceState[]>;

  saveEffect(effect: Effect): Promise<void>;
  getEffect(id: string): Promise<Effect | undefined>;
  listEffects(jobId: JobId): Promise<Effect[]>;

  claimWork(input: {
    workItemId: WorkItemId;
    attemptId: AttemptId;
    fenceToken: FenceToken;
    leaseExpiresAt: string;
    nowIso: string;
  }): Promise<Attempt>;

  heartbeat(input: {
    attemptId: AttemptId;
    fenceToken: FenceToken;
    leaseExpiresAt: string;
  }): Promise<void>;

  commitOutcome(input: {
    attemptId: AttemptId;
    fenceToken: FenceToken;
    workItem: WorkItem;
    job?: Job;
    outcome: OperationOutcome<unknown>;
    finishedAt: string;
    costUsd?: number;
    turns?: number;
    siteActions?: number;
  }): Promise<void>;

  createHumanRequest(item: HumanRequest): Promise<HumanRequest>;

  consumeGrant(input: {
    jobId: JobId;
    grantId: string;
    effect: Effect;
  }): Promise<void>;

  activateRevision(input: {
    jobId: JobId;
    newSpec: SpecVersion;
    workflow: WorkflowSpecV2;
    migration: RevisionMigration;
    nowIso: string;
  }): Promise<void>;

  cancelJob(jobId: JobId, nowIso: string): Promise<Job>;

  appendAudit(event: {
    jobId: JobId;
    at: string;
    type: string;
    payload: unknown;
    evidenceRefs?: string[];
  }): Promise<void>;

  withTransaction<T>(fn: (repo: JobRepository) => Promise<T>): Promise<T>;

  close(): void;
}
