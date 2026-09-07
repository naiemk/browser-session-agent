import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Data root for the new core. Overridable for tests and for the desktop node. */
export function coreRoot(explicit?: string): string {
  return explicit ?? process.env.BSA_CORE_HOME ?? path.join(os.homedir(), ".browser-agent-core");
}

export interface GoalPaths {
  root: string;
  dir: string;
  goalFile: string;
  jobFile: string;
  eventsFile: string;
  /**
   * Cost and duplicate-work metering, deliberately not the ledger.
   *
   * The ledger is evidence: redacted, capped, and meant to be readable years later.
   * Metering is high-volume, disposable, and sampled. Mixing them would bloat the audit
   * trail and make metrics awkward to turn off. They share a goal id, which is enough
   * to join them.
   */
  metricsFile: string;
  /**
   * Every byte the model was sent, verbatim.
   *
   * Neither evidence nor metering: the ledger records what happened in a form meant to
   * be read years later, and metrics record what it cost. This is the raw payload, kept
   * so the screen can show one line without anything being lost. It is the largest file
   * by far and the only one it is safe to delete.
   */
  payloadsFile: string;
  entitiesDir: string;
  tasksDir: string;
  artifactsDir: string;
  /**
   * Working files for typed workers (plan.md, extracts, drafts). Not the ledger.
   * Safe to delete; screenshots and events are not stored here.
   */
  scratchDir: string;
  specsDir: string;
  sprintsDir: string;
  humanDir: string;
  schedulerFile: string;
  locksDir: string;
}

export function goalPaths(root: string, goalId: string): GoalPaths {
  const dir = path.join(root, "goals", goalId);
  return {
    root,
    dir,
    goalFile: path.join(dir, "goal.json"),
    jobFile: path.join(dir, "job.json"),
    eventsFile: path.join(dir, "events.jsonl"),
    metricsFile: path.join(dir, "metrics.jsonl"),
    payloadsFile: path.join(dir, "payloads.jsonl"),
    entitiesDir: path.join(dir, "entities"),
    tasksDir: path.join(dir, "tasks"),
    artifactsDir: path.join(dir, "artifacts"),
    scratchDir: path.join(dir, "scratch"),
    specsDir: path.join(dir, "specs"),
    sprintsDir: path.join(dir, "sprints"),
    humanDir: path.join(dir, "human"),
    schedulerFile: path.join(dir, "scheduler.json"),
    locksDir: path.join(dir, ".locks"),
  };
}

export function browserLockDir(root: string): string {
  return path.join(root, ".locks", "browser");
}

export async function ensureGoalDirs(paths: GoalPaths): Promise<void> {
  await mkdir(paths.entitiesDir, { recursive: true });
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.artifactsDir, { recursive: true });
  await mkdir(paths.scratchDir, { recursive: true });
  await mkdir(paths.specsDir, { recursive: true });
  await mkdir(paths.sprintsDir, { recursive: true });
  await mkdir(paths.humanDir, { recursive: true });
  await mkdir(paths.locksDir, { recursive: true });
}
