import { iso, type Clock } from "../core/clock.ts";
import { shortId } from "../core/ids.ts";
import type { PlanStore, PlanTask } from "../core/plan.ts";
import { JOB_SCHEMA, type SpecRecord, type SprintRecord } from "./types.ts";
import { JobStore, renderSprintMarkdown } from "./store.ts";

export async function createSprint(
  store: JobStore,
  spec: SpecRecord,
  tasks: PlanTask[],
  clock: Clock,
  extra: Partial<SprintRecord> = {},
): Promise<SprintRecord> {
  const sprint: SprintRecord = {
    schemaVersion: JOB_SCHEMA,
    id: extra.id ?? shortId("spr"),
    jobId: store.jobId,
    specVersion: spec.version,
    specHash: spec.hash ?? "",
    taskIds: tasks.map((task) => task.id),
    status: tasks.length === 0 ? "holding" : "open",
    summary: extra.summary ?? (tasks.length === 0 ? "Holding: nothing currently runnable." : `Work ${tasks.length} task(s).`),
    progress: {
      done: 0,
      total: tasks.length,
      parked: 0,
    },
    decisions: extra.decisions ?? [],
    facts: extra.facts ?? {},
    failedApproaches: extra.failedApproaches ?? [],
    blockers: extra.blockers ?? [],
    remaining: tasks.map((task) => task.objective),
    createdAt: iso(clock),
  };
  await store.writeSprint(sprint);
  return sprint;
}

export async function refreshSprint(
  store: JobStore,
  plan: PlanStore,
  sprint: SprintRecord,
  extras: Partial<SprintRecord> = {},
): Promise<SprintRecord> {
  const record = await plan.read();
  const members = record.tasks.filter((task) => sprint.taskIds.includes(task.id));
  const done = members.filter((task) => task.status === "done" || task.status === "abandoned").length;
  const parked = members.filter((task) => task.status === "parked" || task.status === "blocked").length;
  const remaining = members
    .filter((task) => task.status === "pending" || task.status === "running" || task.status === "parked")
    .map((task) => task.objective);
  const next: SprintRecord = {
    ...sprint,
    ...extras,
    progress: { done, total: members.length, parked },
    remaining,
  };
  await store.writeSprint(next);
  return next;
}

export function sprintClosed(sprint: SprintRecord): boolean {
  if (sprint.status === "holding") return false;
  return sprint.progress.done + sprint.progress.parked >= sprint.progress.total && sprint.progress.total > 0
    ? sprint.progress.done === sprint.progress.total
    : sprint.progress.done === sprint.progress.total && sprint.progress.total > 0;
}

export function sprintNeedsRollover(sprint: SprintRecord): boolean {
  if (sprint.status === "holding") return false;
  return sprint.progress.total > 0 && sprint.progress.done + sprint.progress.parked >= sprint.progress.total;
}

void renderSprintMarkdown;
export { renderSprintMarkdown };
