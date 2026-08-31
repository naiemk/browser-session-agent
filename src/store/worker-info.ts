import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { WorkerInfo } from "../domain/types.ts";
import { dataPaths } from "./paths.ts";

export async function readWorkerInfo(root: string): Promise<WorkerInfo | null> {
  const file = dataPaths(root).workerFile;
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as WorkerInfo;
  } catch {
    return null;
  }
}

export async function writeWorkerInfo(root: string, info: WorkerInfo): Promise<void> {
  const paths = dataPaths(root);
  await writeFile(paths.workerFile, JSON.stringify(info, null, 2));
}

export async function clearWorkerInfo(root: string): Promise<void> {
  const file = dataPaths(root).workerFile;
  if (existsSync(file)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(file);
  }
}
