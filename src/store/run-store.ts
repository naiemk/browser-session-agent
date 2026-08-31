import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { RunEvent, RunState } from "../domain/types.ts";
import { nowIso, shortId } from "../domain/ids.ts";
import { dataPaths, ensureDir, type DataPaths } from "./paths.ts";

async function appendJsonl(file: string, row: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(row)}\n`, { flag: "a" });
}

async function readJsonl<T>(file: string): Promise<T[]> {
  if (!existsSync(file)) return [];
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export class RunStore {
  readonly paths: DataPaths;

  constructor(root: string) {
    this.paths = dataPaths(root);
  }

  async init(): Promise<void> {
    await ensureDir(this.paths.runsDir);
  }

  async create(state: RunState): Promise<RunState> {
    await ensureDir(this.paths.runDir(state.runId));
    await ensureDir(this.paths.screenshotDir(state.runId));
    await this.saveState(state);
    return state;
  }

  async saveState(state: RunState): Promise<void> {
    const next = { ...state, updatedAt: nowIso() };
    await ensureDir(this.paths.runDir(state.runId));
    await writeFile(this.paths.stateFile(state.runId), JSON.stringify(next, null, 2));
  }

  async loadState(runId: string): Promise<RunState | null> {
    const file = this.paths.stateFile(runId);
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, "utf8")) as RunState;
  }

  async listStates(): Promise<RunState[]> {
    const { readdir } = await import("node:fs/promises");
    if (!existsSync(this.paths.runsDir)) return [];
    const ids = await readdir(this.paths.runsDir);
    const states: RunState[] = [];
    for (const runId of ids) {
      const state = await this.loadState(runId);
      if (state) states.push(state);
    }
    return states.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async append(
    runId: string,
    type: RunEvent["type"],
    data: Record<string, unknown>,
    tabId?: string,
  ): Promise<RunEvent> {
    await ensureDir(this.paths.runDir(runId));
    const event: RunEvent = {
      id: shortId("evt"),
      ts: nowIso(),
      type,
      runId,
      tabId,
      data,
    };
    await appendJsonl(this.paths.eventsFile(runId), event);
    return event;
  }

  async events(runId: string): Promise<RunEvent[]> {
    return readJsonl<RunEvent>(this.paths.eventsFile(runId));
  }

  screenshotPath(runId: string, name: string): string {
    return `${this.paths.screenshotDir(runId)}/${name}`;
  }
}
