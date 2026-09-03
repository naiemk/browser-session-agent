/**
 * The living task graph.
 *
 * Pi has no planner: todo and plan-mode are example extensions, and the engine knows
 * nothing about goals. So the outer loop is ours.
 *
 * "Living" is the important word. A plan is not produced once and executed: a task
 * that discovers twelve candidates appends twelve child tasks, blocked work parks
 * without stopping unrelated work, and strategy substitution is recorded rather than
 * hidden. The graph is JSON on disk so a fresh process can pick it up tomorrow.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { shortId } from "./ids.ts";
import { ensureGoalDirs, goalPaths, type GoalPaths } from "./paths.ts";
import { parsePredicate } from "./predicates.ts";
import { redactDeep } from "./redact.ts";
import { CoreError, type Predicate } from "./types.ts";

export type PlanTaskStatus = "pending" | "running" | "blocked" | "done" | "failed" | "abandoned";

export interface PlanTask {
  id: string;
  objective: string;
  criteria: Predicate[];
  /** Task ids that must be done first. */
  dependencies: string[];
  /** Named inputs that must be known before this can run. */
  prerequisites: string[];
  status: PlanTaskStatus;
  /** Set when this task was appended by another task's discoveries. */
  parentId?: string;
  entityId?: string;
  /** Which approach this task belongs to, so a whole approach can be abandoned. */
  approach?: string;
  attempts: number;
  failureReason?: string;
  contextNeeds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanRecord {
  goalId: string;
  goal: string;
  /** Inputs the user still has to supply before the plan can finish. */
  missingInputs: string[];
  /** Facts known at the goal level, available to every task. */
  facts: Record<string, unknown>;
  tasks: PlanTask[];
  /** Approach substitutions, oldest first. This is the replan history. */
  revisions: Array<{ at: string; reason: string; from?: string; to?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface AddTaskInput {
  objective: string;
  criteria: Predicate[];
  dependencies?: string[];
  prerequisites?: string[];
  parentId?: string;
  entityId?: string;
  approach?: string;
  id?: string;
}

function planFile(paths: GoalPaths): string {
  return path.join(paths.dir, "plan.json");
}

function now(): string {
  return new Date().toISOString();
}

export class PlanStore {
  private constructor(
    readonly goalId: string,
    private readonly paths: GoalPaths,
  ) {}

  static async open(root: string, goalId: string, goal?: string): Promise<PlanStore> {
    const paths = goalPaths(root, goalId);
    await ensureGoalDirs(paths);
    const store = new PlanStore(goalId, paths);
    if (!(await store.tryRead())) {
      await store.write({
        goalId,
        goal: goal ?? "",
        missingInputs: [],
        facts: {},
        tasks: [],
        revisions: [],
        createdAt: now(),
        updatedAt: now(),
      });
    }
    return store;
  }

  static newGoalId(): string {
    return shortId("goal");
  }

  private async tryRead(): Promise<PlanRecord | undefined> {
    const raw = await readFile(planFile(this.paths), "utf8").catch(() => "");
    if (!raw.trim()) return undefined;
    return JSON.parse(raw) as PlanRecord;
  }

  private async write(record: PlanRecord): Promise<void> {
    await writeFile(planFile(this.paths), `${JSON.stringify(redactDeep(record), null, 2)}\n`, "utf8");
  }

  async read(): Promise<PlanRecord> {
    const record = await this.tryRead();
    if (!record) throw new CoreError("missing_plan", `No plan for ${this.goalId}`);
    return record;
  }

  private async mutate(change: (record: PlanRecord) => PlanRecord): Promise<PlanRecord> {
    const record = await this.read();
    const next = { ...change(record), updatedAt: now() };
    await this.write(next);
    return next;
  }

  async addTask(input: AddTaskInput): Promise<PlanTask> {
    if (input.criteria.length === 0) {
      throw new CoreError("bad_task", "a task needs at least one success criterion");
    }
    const criteria = input.criteria.map((criterion) => parsePredicate(criterion));
    const task: PlanTask = {
      id: input.id ?? shortId("t"),
      objective: input.objective,
      criteria,
      dependencies: input.dependencies ?? [],
      prerequisites: input.prerequisites ?? [],
      status: "pending",
      parentId: input.parentId,
      entityId: input.entityId,
      approach: input.approach,
      attempts: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.mutate((record) => ({ ...record, tasks: [...record.tasks, task] }));
    return task;
  }

  /** Append work discovered while executing. This is what makes the graph living. */
  async discover(parentId: string, inputs: AddTaskInput[]): Promise<PlanTask[]> {
    const parent = await this.requireTask(parentId);
    const created: PlanTask[] = [];
    for (const input of inputs) {
      created.push(
        await this.addTask({
          ...input,
          parentId,
          approach: input.approach ?? parent.approach,
        }),
      );
    }
    return created;
  }

  async requireTask(taskId: string): Promise<PlanTask> {
    const record = await this.read();
    const task = record.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new CoreError("missing_task", `No task ${taskId} in plan`);
    return task;
  }

  async updateTask(taskId: string, change: Partial<PlanTask>): Promise<PlanTask> {
    let updated: PlanTask | undefined;
    await this.mutate((record) => ({
      ...record,
      tasks: record.tasks.map((task) => {
        if (task.id !== taskId) return task;
        updated = { ...task, ...change, id: task.id, updatedAt: now() };
        return updated;
      }),
    }));
    if (!updated) throw new CoreError("missing_task", `No task ${taskId} in plan`);
    return updated;
  }

  async markRunning(taskId: string): Promise<PlanTask> {
    const task = await this.requireTask(taskId);
    return this.updateTask(taskId, { status: "running", attempts: task.attempts + 1 });
  }

  async markDone(taskId: string): Promise<PlanTask> {
    return this.updateTask(taskId, { status: "done", failureReason: undefined });
  }

  async markFailed(taskId: string, reason: string): Promise<PlanTask> {
    return this.updateTask(taskId, { status: "failed", failureReason: reason });
  }

  /** Blocked, not failed: it can run once someone supplies what it needs. */
  async block(taskId: string, missingInputs: string[]): Promise<PlanTask> {
    await this.mutate((record) => ({
      ...record,
      missingInputs: [...new Set([...record.missingInputs, ...missingInputs])],
    }));
    return this.updateTask(taskId, { status: "blocked", prerequisites: missingInputs });
  }

  async provideInputs(facts: Record<string, unknown>): Promise<PlanRecord> {
    const keys = Object.keys(facts);
    return this.mutate((record) => ({
      ...record,
      facts: { ...record.facts, ...facts },
      missingInputs: record.missingInputs.filter((input) => !keys.includes(input)),
      tasks: record.tasks.map((task) =>
        task.status === "blocked" && task.prerequisites.every((need) => keys.includes(need))
          ? { ...task, status: "pending", prerequisites: [], updatedAt: now() }
          : task,
      ),
    }));
  }

  /**
   * The next task that can actually run: pending, dependencies done, prerequisites known.
   * Oldest first, so discovered work does not starve the original plan.
   */
  async nextReadyTask(): Promise<PlanTask | undefined> {
    const record = await this.read();
    const done = new Set(record.tasks.filter((task) => task.status === "done").map((task) => task.id));
    const known = new Set(Object.keys(record.facts));
    return record.tasks
      .filter((task) => task.status === "pending")
      .filter((task) => task.dependencies.every((id) => done.has(id)))
      .filter((task) => task.prerequisites.every((need) => known.has(need)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  async isComplete(): Promise<boolean> {
    const record = await this.read();
    if (record.tasks.length === 0) return false;
    return record.tasks.every((task) => task.status === "done" || task.status === "abandoned");
  }

  /**
   * Strategy substitution: abandon an approach and record why. Local trouble belongs to
   * the executor; this is for "searching this way cannot work, try another route".
   */
  async replaceApproach(input: {
    reason: string;
    abandon?: string;
    adopt?: { approach: string; tasks: AddTaskInput[] };
  }): Promise<PlanRecord> {
    await this.mutate((record) => ({
      ...record,
      tasks: record.tasks.map((task) =>
        input.abandon && task.approach === input.abandon && task.status !== "done"
          ? { ...task, status: "abandoned", failureReason: input.reason, updatedAt: now() }
          : task,
      ),
      revisions: [
        ...record.revisions,
        { at: now(), reason: input.reason, from: input.abandon, to: input.adopt?.approach },
      ],
    }));

    for (const task of input.adopt?.tasks ?? []) {
      await this.addTask({ ...task, approach: input.adopt!.approach });
    }
    return this.read();
  }

  async summary(): Promise<{
    total: number;
    byStatus: Record<PlanTaskStatus, number>;
    missingInputs: string[];
    revisions: number;
  }> {
    const record = await this.read();
    const byStatus = {
      pending: 0,
      running: 0,
      blocked: 0,
      done: 0,
      failed: 0,
      abandoned: 0,
    } as Record<PlanTaskStatus, number>;
    for (const task of record.tasks) byStatus[task.status] += 1;
    return {
      total: record.tasks.length,
      byStatus,
      missingInputs: record.missingInputs,
      revisions: record.revisions.length,
    };
  }
}
