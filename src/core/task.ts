/**
 * Tasks and the oracle that judges them (D20).
 *
 * Coding validation works because the tests exist independently of the agent and
 * cannot be weakened by it. The browser equivalent: criteria arrive with the task,
 * are written to disk at creation, and are re-read from disk whenever an outcome is
 * decided. Nothing the executor says or passes can change what gets evaluated.
 *
 * The agent may add its own step-level checks. Those are evidence and local
 * recovery signal — never a substitute for the given criteria.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserPort } from "./browser.ts";
import { shortId } from "./ids.ts";
import type { Ledger } from "./ledger.ts";
import { ensureGoalDirs, goalPaths, type GoalPaths } from "./paths.ts";
import { parsePredicate, verify } from "./predicates.ts";
import { redactDeep } from "./redact.ts";
import {
  CoreError,
  type Predicate,
  type TaskOutcome,
  type Verification,
} from "./types.ts";

export type TaskStatus = "pending" | "running" | "parked" | "done" | "failed";

export interface TaskRecord {
  taskId: string;
  goalId: string;
  entityId?: string;
  /** Stated as an objective, not as a click list. */
  objective: string;
  /** Immutable success criteria, supplied with the task. */
  criteria: Predicate[];
  status: TaskStatus;
  maxTurns?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  objective: string;
  criteria: Predicate[];
  entityId?: string;
  maxTurns?: number;
  taskId?: string;
}

function taskFile(paths: GoalPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.json`);
}

async function readTask(paths: GoalPaths, taskId: string): Promise<TaskRecord | undefined> {
  const raw = await readFile(taskFile(paths, taskId), "utf8").catch(() => "");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as TaskRecord;
}

async function writeTask(paths: GoalPaths, record: TaskRecord): Promise<void> {
  await writeFile(taskFile(paths, record.taskId), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export class TaskStore {
  private constructor(
    readonly goalId: string,
    private readonly paths: GoalPaths,
  ) {}

  static async open(root: string, goalId: string): Promise<TaskStore> {
    const paths = goalPaths(root, goalId);
    await ensureGoalDirs(paths);
    return new TaskStore(goalId, paths);
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    if (input.criteria.length === 0) {
      throw new CoreError("bad_task", "a task needs at least one success criterion");
    }
    // Validate now so an unusable criterion fails loudly at authoring time.
    const criteria = input.criteria.map((criterion) => parsePredicate(criterion));
    const record: TaskRecord = {
      taskId: input.taskId ?? shortId("task"),
      goalId: this.goalId,
      entityId: input.entityId,
      objective: input.objective,
      criteria,
      status: "pending",
      maxTurns: input.maxTurns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeTask(this.paths, record);
    return structuredClone(record);
  }

  async get(taskId: string): Promise<TaskRecord | undefined> {
    return readTask(this.paths, taskId);
  }

  async require(taskId: string): Promise<TaskRecord> {
    const record = await this.get(taskId);
    if (!record) throw new CoreError("missing_task", `No task ${taskId}`);
    return record;
  }

  async list(): Promise<TaskRecord[]> {
    const names = await readdir(this.paths.tasksDir).catch(() => []);
    const records: TaskRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const record = await readTask(this.paths, name.replace(/\.json$/, ""));
      if (record) records.push(record);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async setStatus(taskId: string, status: TaskStatus): Promise<TaskRecord> {
    const record = await this.require(taskId);
    const next = { ...record, status, updatedAt: new Date().toISOString() };
    await writeTask(this.paths, next);
    return next;
  }

  /**
   * The criteria as stored, for showing the agent what the target is.
   * Deep-frozen so a caller cannot hand a mutable reference to the executor.
   */
  async criteriaFor(taskId: string): Promise<readonly Predicate[]> {
    const record = await this.require(taskId);
    return Object.freeze(structuredClone(record.criteria).map((c) => Object.freeze(c)));
  }
}

export interface ResolveOptions {
  /** What the executor says it did. Recorded, never trusted. */
  claim?: string;
  ledger?: Ledger;
  tabId?: string;
  /** Set when the turn cap stopped the task rather than the task finishing. */
  capped?: boolean;
}

export interface TaskResolution {
  outcome: TaskOutcome;
  verification: Verification;
}

/**
 * Decide a task's outcome from the page, not from the executor's report.
 *
 * Criteria are re-read from disk here on purpose: a resumed task in a fresh process
 * is judged by exactly the same standard as the original attempt.
 */
export async function resolveTaskOutcome(
  store: TaskStore,
  taskId: string,
  browser: BrowserPort,
  options: ResolveOptions = {},
): Promise<TaskResolution> {
  const record = await store.require(taskId);
  const facts = await browser.facts(options.tabId);
  const verification = verify(record.criteria, facts);

  const outcome: TaskOutcome =
    verification.status === "passed"
      ? { status: "success", detail: summarize(verification) }
      : options.capped
        ? { status: "capped", turns: record.maxTurns ?? 0 }
        : { status: "failed", reason: summarize(verification) };

  await store.setStatus(taskId, outcome.status === "success" ? "done" : "failed");

  await options.ledger?.append({
    type: "task_finished",
    entityId: record.entityId,
    intent: record.objective,
    after: { url: facts.url, title: facts.title, changes: facts.observation.changes },
    outcome: { ok: outcome.status === "success", detail: summarize(verification) },
    payload: redactDeep({
      taskId,
      claim: options.claim,
      criteria: record.criteria,
      checks: verification.checks,
    }),
  });

  return { outcome, verification };
}

function summarize(verification: Verification): string {
  const failed = verification.checks.filter((check) => !check.passed);
  if (failed.length === 0) {
    return verification.checks.map((check) => check.predicate).join("; ") || "criteria met";
  }
  return failed.map((check) => `${check.predicate} — ${check.detail}`).join("; ");
}

/**
 * An agent-authored step check. Validated against the closed predicate set, run in
 * code, and recorded as evidence. Additive by construction: it returns a
 * verification and touches no task state.
 */
export async function stepCheck(
  browser: BrowserPort,
  rawPredicate: unknown,
  options: { ledger?: Ledger; entityId?: string; intent?: string; tabId?: string } = {},
): Promise<Verification> {
  const predicate = parsePredicate(rawPredicate);
  const facts = await browser.facts(options.tabId);
  const verification = verify([predicate], facts);

  await options.ledger?.append({
    type: "check",
    entityId: options.entityId,
    intent: options.intent ?? "step check",
    after: { url: facts.url, title: facts.title, changes: facts.observation.changes },
    outcome: {
      ok: verification.status === "passed",
      detail: verification.checks.map((check) => `${check.predicate}: ${check.detail}`).join("; "),
    },
  });

  return verification;
}
