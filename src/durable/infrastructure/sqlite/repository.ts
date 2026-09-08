import type { DatabaseSync } from "node:sqlite";
import { cancelJob, transitionJobLifecycle } from "../../domain/job-lifecycle.ts";
import { upsertCase } from "../../domain/case.ts";
import { DomainError } from "../../domain/errors.ts";
import type {
  Attempt,
  Case,
  Effect,
  HumanRequest,
  Job,
  JobId,
  OperationOutcome,
  ResourceState,
  SpecVersion,
  WorkItem,
  WorkItemId,
} from "../../domain/types.ts";
import type { WorkflowSpecV2 } from "../../domain/spec-types.ts";
import type { RevisionMigration } from "../../application/revision.ts";
import type { JobRepository } from "../../ports/repository.ts";
import { openDatabase } from "./schema.ts";
import { newId } from "../../application/planning.ts";

function j(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

export class SqliteJobRepository implements JobRepository {
  private constructor(private readonly db: DatabaseSync) {}

  static open(path: string): SqliteJobRepository {
    return new SqliteJobRepository(openDatabase(path));
  }

  close(): void {
    this.db.close();
  }

  withTransaction<T>(fn: (repo: JobRepository) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE;");
    return Promise.resolve()
      .then(() => fn(this))
      .then((value) => {
        this.db.exec("COMMIT;");
        return value;
      })
      .catch((err) => {
        try {
          this.db.exec("ROLLBACK;");
        } catch {
          /* ignore */
        }
        throw err;
      });
  }

  async createJob(input: {
    jobId?: JobId;
    title: string;
    objective: string;
    caseMode: Job["caseMode"];
  }): Promise<Job> {
    const now = new Date().toISOString();
    const job: Job = {
      jobId: input.jobId ?? newId("job"),
      title: input.title,
      objective: input.objective,
      lifecycle: "planning",
      caseMode: input.caseMode,
      draftSpecVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveJob(job);
    return job;
  }

  async getJob(jobId: JobId): Promise<Job | undefined> {
    const row = this.db.prepare("SELECT * FROM jobs WHERE job_id = ?").get(jobId) as Record<string, unknown> | undefined;
    return row ? mapJob(row) : undefined;
  }

  async listJobs(): Promise<Job[]> {
    const rows = this.db.prepare("SELECT * FROM jobs ORDER BY updated_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map(mapJob);
  }

  async saveJob(job: Job): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO jobs(job_id,title,objective,lifecycle,case_mode,active_spec_version,active_spec_hash,draft_spec_version,created_at,updated_at,paused_at,completed_at,next_wake_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(job_id) DO UPDATE SET
           title=excluded.title, objective=excluded.objective, lifecycle=excluded.lifecycle,
           case_mode=excluded.case_mode, active_spec_version=excluded.active_spec_version,
           active_spec_hash=excluded.active_spec_hash, draft_spec_version=excluded.draft_spec_version,
           updated_at=excluded.updated_at, paused_at=excluded.paused_at, completed_at=excluded.completed_at,
           next_wake_at=excluded.next_wake_at`,
      )
      .run(
        job.jobId,
        job.title,
        job.objective,
        job.lifecycle,
        job.caseMode,
        job.activeSpecVersion ?? null,
        job.activeSpecHash ?? null,
        job.draftSpecVersion,
        job.createdAt,
        job.updatedAt,
        job.pausedAt ?? null,
        job.completedAt ?? null,
        job.nextWakeAt ?? null,
      );
  }

  async saveSpecVersion(spec: SpecVersion): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO spec_versions(job_id,version,status,hash,canonical_bytes,created_at,approved_at)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(job_id,version) DO UPDATE SET
           status=excluded.status, hash=excluded.hash, canonical_bytes=excluded.canonical_bytes,
           approved_at=excluded.approved_at`,
      )
      .run(
        spec.jobId,
        spec.version,
        spec.status,
        spec.hash ?? null,
        spec.canonicalBytes,
        spec.createdAt,
        spec.approvedAt ?? null,
      );
  }

  async getSpecVersion(jobId: JobId, version: number): Promise<SpecVersion | undefined> {
    const row = this.db
      .prepare("SELECT * FROM spec_versions WHERE job_id = ? AND version = ?")
      .get(jobId, version) as Record<string, unknown> | undefined;
    return row ? mapSpec(row) : undefined;
  }

  async getApprovedSpec(jobId: JobId): Promise<{ record: SpecVersion; workflow: WorkflowSpecV2 } | undefined> {
    const row = this.db
      .prepare("SELECT * FROM spec_versions WHERE job_id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1")
      .get(jobId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const record = mapSpec(row);
    return { record, workflow: JSON.parse(record.canonicalBytes) as WorkflowSpecV2 };
  }

  async upsertCases(jobId: JobId, cases: Case[]): Promise<Case[]> {
    const existing = await this.listCases(jobId);
    let next = existing;
    for (const c of cases) {
      if (c.jobId !== jobId) throw new DomainError("case_job_mismatch", "case jobId mismatch");
      next = upsertCase(next, c);
    }
    for (const c of next) {
      this.db
        .prepare(
          `INSERT INTO cases(job_id,case_key,label,stage,facts_json,outcome_json,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?)
           ON CONFLICT(job_id,case_key) DO UPDATE SET
             label=excluded.label, stage=excluded.stage, facts_json=excluded.facts_json,
             outcome_json=excluded.outcome_json, updated_at=excluded.updated_at`,
        )
        .run(
          c.jobId,
          c.caseKey,
          c.label,
          c.stage,
          j(c.facts),
          c.outcome ? j(c.outcome) : null,
          c.createdAt,
          c.updatedAt,
        );
    }
    return next.filter((c) => cases.some((x) => x.caseKey === c.caseKey) || existing.some((e) => e.caseKey === c.caseKey));
  }

  async listCases(jobId: JobId): Promise<Case[]> {
    const rows = this.db.prepare("SELECT * FROM cases WHERE job_id = ?").all(jobId) as Array<Record<string, unknown>>;
    return rows.map(mapCase);
  }

  async saveWorkItem(item: WorkItem): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO work_items(id,job_id,case_key,template_id,spec_version,spec_hash,objective,status,dependencies_json,resource_key,attempts,max_attempts,deferred_until,checkpoint_json,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status, attempts=excluded.attempts, deferred_until=excluded.deferred_until,
           checkpoint_json=excluded.checkpoint_json, updated_at=excluded.updated_at,
           dependencies_json=excluded.dependencies_json, resource_key=excluded.resource_key`,
      )
      .run(
        item.id,
        item.jobId,
        item.caseKey ?? null,
        item.templateId,
        item.specVersion,
        item.specHash,
        item.objective,
        item.status,
        j(item.dependencies),
        item.resourceKey ?? null,
        item.attempts,
        item.maxAttempts,
        item.deferredUntil ?? null,
        item.checkpoint ? j(item.checkpoint) : null,
        item.createdAt,
        item.updatedAt,
      );
  }

  async getWorkItem(id: WorkItemId): Promise<WorkItem | undefined> {
    const row = this.db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapWork(row) : undefined;
  }

  async listWorkItems(jobId: JobId): Promise<WorkItem[]> {
    const rows = this.db.prepare("SELECT * FROM work_items WHERE job_id = ?").all(jobId) as Array<Record<string, unknown>>;
    return rows.map(mapWork);
  }

  async listHumans(jobId: JobId): Promise<HumanRequest[]> {
    const rows = this.db.prepare("SELECT * FROM human_requests WHERE job_id = ?").all(jobId) as Array<
      Record<string, unknown>
    >;
    return rows.map(mapHuman);
  }

  async saveHuman(item: HumanRequest): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO human_requests(id,job_id,kind,status,perishable,work_item_id,case_key,resource_key,reason,handoff,checkpoint_json,resolution,created_at,updated_at,expires_at,resolved_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status, resolution=excluded.resolution, updated_at=excluded.updated_at,
           expires_at=excluded.expires_at, resolved_at=excluded.resolved_at, checkpoint_json=excluded.checkpoint_json`,
      )
      .run(
        item.id,
        item.jobId,
        item.kind,
        item.status,
        item.perishable ? 1 : 0,
        item.workItemId ?? null,
        item.caseKey ?? null,
        item.resourceKey,
        item.reason,
        item.handoff,
        item.checkpoint ? j(item.checkpoint) : null,
        item.resolution ?? null,
        item.createdAt,
        item.updatedAt,
        item.expiresAt ?? null,
        item.resolvedAt ?? null,
      );
  }

  async getResource(key: string): Promise<ResourceState | undefined> {
    const row = this.db.prepare("SELECT * FROM resources WHERE key = ?").get(key) as Record<string, unknown> | undefined;
    return row ? mapResource(row) : undefined;
  }

  async saveResource(state: ResourceState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO resources(key,scope,failures,not_before,circuit_open_until,window_actions,window_cost_usd,updated_at)
         VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET
           failures=excluded.failures, not_before=excluded.not_before, circuit_open_until=excluded.circuit_open_until,
           window_actions=excluded.window_actions, window_cost_usd=excluded.window_cost_usd, updated_at=excluded.updated_at`,
      )
      .run(
        state.key,
        state.scope,
        state.failures,
        state.notBefore ?? null,
        state.circuitOpenUntil ?? null,
        state.windowActions,
        state.windowCostUsd,
        state.updatedAt,
      );
  }

  async listResources(): Promise<ResourceState[]> {
    const rows = this.db.prepare("SELECT * FROM resources").all() as Array<Record<string, unknown>>;
    return rows.map(mapResource);
  }

  async saveEffect(effect: Effect): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO effects(id,job_id,work_item_id,attempt_id,kind,status,identity_key,destination,evidence_json,prepared_at,dispatched_at,observed_at,reconciled_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status, attempt_id=excluded.attempt_id, evidence_json=excluded.evidence_json,
           dispatched_at=excluded.dispatched_at, observed_at=excluded.observed_at, reconciled_at=excluded.reconciled_at`,
      )
      .run(
        effect.id,
        effect.jobId,
        effect.workItemId,
        effect.attemptId ?? null,
        effect.kind,
        effect.status,
        effect.identityKey,
        effect.destination ?? null,
        j(effect.evidenceIds),
        effect.preparedAt,
        effect.dispatchedAt ?? null,
        effect.observedAt ?? null,
        effect.reconciledAt ?? null,
      );
  }

  async getEffect(id: string): Promise<Effect | undefined> {
    const row = this.db.prepare("SELECT * FROM effects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapEffect(row) : undefined;
  }

  async listEffects(jobId: JobId): Promise<Effect[]> {
    const rows = this.db.prepare("SELECT * FROM effects WHERE job_id = ?").all(jobId) as Array<Record<string, unknown>>;
    return rows.map(mapEffect);
  }

  async claimWork(input: {
    workItemId: WorkItemId;
    attemptId: string;
    fenceToken: string;
    leaseExpiresAt: string;
    nowIso: string;
  }): Promise<Attempt> {
    return this.withTransaction(async () => {
      const item = await this.getWorkItem(input.workItemId);
      if (!item) throw new DomainError("missing_work", `work item ${input.workItemId}`);
      if (item.status !== "ready" && item.status !== "pending") {
        throw new DomainError("not_claimable", `status ${item.status}`);
      }
      const active = this.db
        .prepare(
          `SELECT id FROM attempts WHERE work_item_id = ? AND status = 'running' AND lease_expires_at > ?`,
        )
        .get(input.workItemId, input.nowIso);
      if (active) throw new DomainError("lease_busy", "work item already leased");

      const attempt: Attempt = {
        id: input.attemptId,
        jobId: item.jobId,
        workItemId: item.id,
        fenceToken: input.fenceToken,
        status: "running",
        leaseExpiresAt: input.leaseExpiresAt,
        startedAt: input.nowIso,
        costUsd: 0,
        turns: 0,
        siteActions: 0,
      };
      this.db
        .prepare(
          `INSERT INTO attempts(id,job_id,work_item_id,fence_token,status,lease_expires_at,started_at,cost_usd,turns,site_actions)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          attempt.id,
          attempt.jobId,
          attempt.workItemId,
          attempt.fenceToken,
          attempt.status,
          attempt.leaseExpiresAt,
          attempt.startedAt,
          0,
          0,
          0,
        );
      await this.saveWorkItem({
        ...item,
        status: "leased",
        attempts: item.attempts + 1,
        updatedAt: input.nowIso,
      });
      return attempt;
    });
  }

  async heartbeat(input: { attemptId: string; fenceToken: string; leaseExpiresAt: string }): Promise<void> {
    const result = this.db
      .prepare(
        `UPDATE attempts SET lease_expires_at = ? WHERE id = ? AND fence_token = ? AND status = 'running'`,
      )
      .run(input.leaseExpiresAt, input.attemptId, input.fenceToken);
    if (result.changes !== 1) throw new DomainError("stale_fence", "heartbeat rejected");
  }

  async commitOutcome(input: {
    attemptId: string;
    fenceToken: string;
    workItem: WorkItem;
    job?: Job;
    outcome: OperationOutcome<unknown>;
    finishedAt: string;
    costUsd?: number;
    turns?: number;
    siteActions?: number;
  }): Promise<void> {
    await this.withTransaction(async () => {
      const row = this.db.prepare("SELECT * FROM attempts WHERE id = ?").get(input.attemptId) as
        | Record<string, unknown>
        | undefined;
      if (!row) throw new DomainError("missing_attempt", input.attemptId);
      if (row.fence_token !== input.fenceToken) throw new DomainError("stale_fence", "stale_fence: commit rejected");
      if (row.status !== "running") throw new DomainError("not_running", String(row.status));

      const status =
        input.outcome.status === "completed"
          ? "completed"
          : input.outcome.status === "blocked"
            ? "blocked"
            : input.outcome.status === "cancelled"
              ? "cancelled"
              : "failed";

      this.db
        .prepare(
          `UPDATE attempts SET status = ?, finished_at = ?, outcome_json = ?, cost_usd = ?, turns = ?, site_actions = ?
           WHERE id = ? AND fence_token = ?`,
        )
        .run(
          status,
          input.finishedAt,
          j(input.outcome),
          input.costUsd ?? 0,
          input.turns ?? 0,
          input.siteActions ?? 0,
          input.attemptId,
          input.fenceToken,
        );
      await this.saveWorkItem(input.workItem);
      if (input.job) await this.saveJob(input.job);
    });
  }

  async createHumanRequest(item: HumanRequest): Promise<HumanRequest> {
    const open = await this.listHumans(item.jobId);
    const dup = open.find(
      (h) =>
        h.kind === "challenge" &&
        (h.status === "waiting" || h.status === "ready" || h.status === "rehydrating") &&
        h.resourceKey === item.resourceKey &&
        h.workItemId === item.workItemId,
    );
    if (dup && item.kind === "challenge") return dup;
    await this.saveHuman(item);
    return item;
  }

  async consumeGrant(input: { jobId: JobId; grantId: string; effect: Effect }): Promise<void> {
    await this.withTransaction(async () => {
      await this.saveEffect(input.effect);
      const row = this.db
        .prepare("SELECT used FROM grant_usage WHERE job_id = ? AND grant_id = ?")
        .get(input.jobId, input.grantId) as { used: number } | undefined;
      const used = (row?.used ?? 0) + 1;
      this.db
        .prepare(
          `INSERT INTO grant_usage(job_id,grant_id,used) VALUES(?,?,?)
           ON CONFLICT(job_id,grant_id) DO UPDATE SET used=excluded.used`,
        )
        .run(input.jobId, input.grantId, used);
    });
  }

  async activateRevision(input: {
    jobId: JobId;
    newSpec: SpecVersion;
    workflow: WorkflowSpecV2;
    migration: RevisionMigration;
    nowIso: string;
  }): Promise<void> {
    await this.withTransaction(async () => {
      const job = await this.getJob(input.jobId);
      if (!job) throw new DomainError("missing_job", input.jobId);
      await this.saveSpecVersion(input.newSpec);
      const items = await this.listWorkItems(input.jobId);

      if (input.migration.action === "archive_job") {
        await this.saveJob(transitionJobLifecycle(job, "archived", input.nowIso));
        return;
      }
      if (input.migration.action === "retain") {
        const retain = new Set(input.migration.workItemIds);
        for (const item of items) {
          if (!retain.has(item.id) && item.status !== "done") {
            await this.saveWorkItem({ ...item, status: "cancelled", updatedAt: input.nowIso });
          }
        }
      }
      if (input.migration.action === "cancel_rebuild") {
        const targets = input.migration.workItemIds
          ? items.filter((i) => input.migration.action === "cancel_rebuild" && input.migration.workItemIds!.includes(i.id))
          : items.filter((i) => i.status !== "done");
        for (const item of targets) {
          await this.saveWorkItem({ ...item, status: "cancelled", updatedAt: input.nowIso });
        }
      }
      if (input.migration.action === "map") {
        // mapping applied by materializer after activation
      }

      await this.saveJob({
        ...job,
        lifecycle: job.lifecycle === "active" ? "active" : transitionJobLifecycle(job, "active", input.nowIso).lifecycle,
        activeSpecVersion: input.newSpec.version,
        activeSpecHash: input.newSpec.hash,
        draftSpecVersion: input.newSpec.version,
        updatedAt: input.nowIso,
      });
    });
  }

  async cancelJob(jobId: JobId, nowIso: string): Promise<Job> {
    return this.withTransaction(async () => {
      const job = await this.getJob(jobId);
      if (!job) throw new DomainError("missing_job", jobId);
      const next = cancelJob(job, nowIso);
      await this.saveJob(next);
      const items = await this.listWorkItems(jobId);
      for (const item of items) {
        if (item.status === "pending" || item.status === "ready" || item.status === "blocked" || item.status === "leased") {
          await this.saveWorkItem({ ...item, status: "cancelled", updatedAt: nowIso });
        }
      }
      return next;
    });
  }

  async appendAudit(event: {
    jobId: JobId;
    at: string;
    type: string;
    payload: unknown;
    evidenceRefs?: string[];
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO audit_events(job_id,at,type,payload_json,evidence_refs) VALUES(?,?,?,?,?)`,
      )
      .run(event.jobId, event.at, event.type, j(event.payload), event.evidenceRefs ? j(event.evidenceRefs) : null);
  }
}

function mapJob(row: Record<string, unknown>): Job {
  return {
    jobId: String(row.job_id),
    title: String(row.title),
    objective: String(row.objective),
    lifecycle: row.lifecycle as Job["lifecycle"],
    caseMode: row.case_mode as Job["caseMode"],
    activeSpecVersion: row.active_spec_version != null ? Number(row.active_spec_version) : undefined,
    activeSpecHash: row.active_spec_hash != null ? String(row.active_spec_hash) : undefined,
    draftSpecVersion: Number(row.draft_spec_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    pausedAt: row.paused_at != null ? String(row.paused_at) : undefined,
    completedAt: row.completed_at != null ? String(row.completed_at) : undefined,
    nextWakeAt: row.next_wake_at != null ? String(row.next_wake_at) : undefined,
  };
}

function mapSpec(row: Record<string, unknown>): SpecVersion {
  return {
    jobId: String(row.job_id),
    version: Number(row.version),
    status: row.status as SpecVersion["status"],
    hash: row.hash != null ? String(row.hash) : undefined,
    canonicalBytes: String(row.canonical_bytes),
    createdAt: String(row.created_at),
    approvedAt: row.approved_at != null ? String(row.approved_at) : undefined,
  };
}

function mapCase(row: Record<string, unknown>): Case {
  return {
    jobId: String(row.job_id),
    caseKey: String(row.case_key),
    label: String(row.label),
    stage: String(row.stage),
    facts: parseJson(String(row.facts_json), {}),
    outcome: row.outcome_json ? parseJson(String(row.outcome_json), undefined) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapWork(row: Record<string, unknown>): WorkItem {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    caseKey: row.case_key != null ? String(row.case_key) : undefined,
    templateId: String(row.template_id),
    specVersion: Number(row.spec_version),
    specHash: String(row.spec_hash),
    objective: String(row.objective),
    status: row.status as WorkItem["status"],
    dependencies: parseJson(String(row.dependencies_json), []),
    resourceKey: row.resource_key != null ? String(row.resource_key) : undefined,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    deferredUntil: row.deferred_until != null ? String(row.deferred_until) : undefined,
    checkpoint: row.checkpoint_json ? parseJson(String(row.checkpoint_json), undefined) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHuman(row: Record<string, unknown>): HumanRequest {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    kind: row.kind as HumanRequest["kind"],
    status: row.status as HumanRequest["status"],
    perishable: Boolean(row.perishable),
    workItemId: row.work_item_id != null ? String(row.work_item_id) : undefined,
    caseKey: row.case_key != null ? String(row.case_key) : undefined,
    resourceKey: String(row.resource_key),
    reason: String(row.reason),
    handoff: String(row.handoff),
    checkpoint: row.checkpoint_json ? parseJson(String(row.checkpoint_json), undefined) : undefined,
    resolution: row.resolution != null ? String(row.resolution) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    expiresAt: row.expires_at != null ? String(row.expires_at) : undefined,
    resolvedAt: row.resolved_at != null ? String(row.resolved_at) : undefined,
  };
}

function mapResource(row: Record<string, unknown>): ResourceState {
  return {
    key: String(row.key),
    scope: row.scope as ResourceState["scope"],
    failures: Number(row.failures),
    notBefore: row.not_before != null ? String(row.not_before) : undefined,
    circuitOpenUntil: row.circuit_open_until != null ? String(row.circuit_open_until) : undefined,
    windowActions: Number(row.window_actions),
    windowCostUsd: Number(row.window_cost_usd),
    updatedAt: String(row.updated_at),
  };
}

function mapEffect(row: Record<string, unknown>): Effect {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    workItemId: String(row.work_item_id),
    attemptId: row.attempt_id != null ? String(row.attempt_id) : undefined,
    kind: String(row.kind),
    status: row.status as Effect["status"],
    identityKey: String(row.identity_key),
    destination: row.destination != null ? String(row.destination) : undefined,
    evidenceIds: parseJson(String(row.evidence_json), []),
    preparedAt: String(row.prepared_at),
    dispatchedAt: row.dispatched_at != null ? String(row.dispatched_at) : undefined,
    observedAt: row.observed_at != null ? String(row.observed_at) : undefined,
    reconciledAt: row.reconciled_at != null ? String(row.reconciled_at) : undefined,
  };
}
