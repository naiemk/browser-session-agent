import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface DataPaths {
  root: string;
  profileDir: string;
  workerFile: string;
  runsDir: string;
  knowledgeFile: string;
  runDir(runId: string): string;
  eventsFile(runId: string): string;
  stateFile(runId: string): string;
  screenshotDir(runId: string): string;
}

export function resolveHome(cwd = process.cwd()): string {
  if (process.env.BSA_HOME) return process.env.BSA_HOME;
  const local = path.join(cwd, ".browser-session-agent");
  if (existsSync(local)) return local;
  return path.join(homedir(), ".browser-session-agent");
}

export function dataPaths(root: string): DataPaths {
  return {
    root,
    profileDir: path.join(root, "profile"),
    workerFile: path.join(root, "worker.json"),
    runsDir: path.join(root, "runs"),
    knowledgeFile: path.join(root, "knowledge", "records.jsonl"),
    runDir: (runId) => path.join(root, "runs", runId),
    eventsFile: (runId) => path.join(root, "runs", runId, "events.jsonl"),
    stateFile: (runId) => path.join(root, "runs", runId, "state.json"),
    screenshotDir: (runId) => path.join(root, "runs", runId, "screenshots"),
  };
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
