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
  entitiesDir: string;
  tasksDir: string;
  artifactsDir: string;
}

export function goalPaths(root: string, goalId: string): GoalPaths {
  const dir = path.join(root, "goals", goalId);
  return {
    root,
    dir,
    goalFile: path.join(dir, "goal.json"),
    eventsFile: path.join(dir, "events.jsonl"),
    metricsFile: path.join(dir, "metrics.jsonl"),
    entitiesDir: path.join(dir, "entities"),
    tasksDir: path.join(dir, "tasks"),
    artifactsDir: path.join(dir, "artifacts"),
  };
}

export async function ensureGoalDirs(paths: GoalPaths): Promise<void> {
  await mkdir(paths.entitiesDir, { recursive: true });
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.artifactsDir, { recursive: true });
}
