import { createWorkItem } from "../domain/work-item.ts";
import type { Case, Job, WorkItem } from "../domain/types.ts";
import type { WorkflowSpecV2 } from "../domain/spec-types.ts";
import { newId } from "./planning.ts";

/** CASE-01 / CASE-02 — materialize job seeds and per-case graphs. */
export function materializeSeedWorkItems(job: Job, workflow: WorkflowSpecV2, specHash: string, now: string): WorkItem[] {
  const seeds = workflow.templates.filter((t) => t.scope === "job" && !t.discoverable);
  return seeds.map((t) =>
    createWorkItem(
      {
        id: newId("wi"),
        jobId: job.jobId,
        templateId: t.id,
        specVersion: workflow.version,
        specHash,
        objective: t.objective,
        dependencies: [],
        resourceKey: t.resource,
        maxAttempts: t.maxAttempts ?? 3,
      },
      now,
    ),
  );
}

export function materializeCaseWorkItems(
  job: Job,
  caseRecord: Case,
  workflow: WorkflowSpecV2,
  specHash: string,
  now: string,
): WorkItem[] {
  const templates = workflow.templates.filter((t) => t.scope === "case");
  const byId = new Map(templates.map((t) => [t.id, t]));
  const created = new Map<string, WorkItem>();

  for (const t of templates) {
    const wi = createWorkItem(
      {
        id: newId("wi"),
        jobId: job.jobId,
        caseKey: caseRecord.caseKey,
        templateId: t.id,
        specVersion: workflow.version,
        specHash,
        objective: t.objective,
        dependencies: [],
        resourceKey: t.resource,
        maxAttempts: t.maxAttempts ?? 3,
      },
      now,
    );
    created.set(t.id, wi);
  }

  // Wire dependencies by template id → work item id within the case
  for (const t of templates) {
    const wi = created.get(t.id)!;
    const deps = (t.dependencies ?? [])
      .map((depTemplateId) => {
        if (!byId.has(depTemplateId)) return undefined;
        return created.get(depTemplateId)?.id;
      })
      .filter((id): id is string => Boolean(id));
    created.set(t.id, { ...wi, dependencies: deps });
  }

  return [...created.values()];
}

export type DiscoveryRecord = { caseKey: string; label: string; facts?: Record<string, unknown>; stage?: string };

export function discoveryToCase(jobId: string, record: DiscoveryRecord, now: string): Case {
  return {
    jobId,
    caseKey: record.caseKey,
    label: record.label,
    stage: record.stage ?? "discovered",
    facts: record.facts ?? {},
    createdAt: now,
    updatedAt: now,
  };
}
