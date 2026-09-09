import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface PrototypeValidationReport {
  root: string;
  jobDirs: string[];
  ok: string[];
  malformed: Array<{ jobId: string; reason: string }>;
  unsupported: Array<{ jobId: string; reason: string }>;
}

export async function validatePrototypeRoot(root: string): Promise<PrototypeValidationReport> {
  const goalsDir = path.join(root, "goals");
  let entries: string[] = [];
  try {
    entries = await readdir(goalsDir);
  } catch {
    return { root, jobDirs: [], ok: [], malformed: [], unsupported: [] };
  }
  const report: PrototypeValidationReport = { root, jobDirs: [], ok: [], malformed: [], unsupported: [] };
  for (const name of entries) {
    if (!name.startsWith("job_")) continue;
    report.jobDirs.push(name);
    const jobFile = path.join(goalsDir, name, "job.json");
    try {
      const raw = JSON.parse(await readFile(jobFile, "utf8")) as Record<string, unknown>;
      if (typeof raw.jobId !== "string" || typeof raw.objective !== "string") {
        report.malformed.push({ jobId: name, reason: "missing jobId/objective" });
        continue;
      }
      if (raw.currentSprintId) {
        report.unsupported.push({ jobId: name, reason: "authoritative sprint present; import as archive only" });
      }
      report.ok.push(name);
    } catch (err) {
      report.malformed.push({ jobId: name, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}

export async function archivePrototypeJob(root: string, jobId: string, archiveRoot: string): Promise<string> {
  const src = path.join(root, "goals", jobId);
  const dest = path.join(archiveRoot, jobId);
  await mkdir(dest, { recursive: true });
  const marker = {
    archivedAt: new Date().toISOString(),
    source: src,
    runnable: false,
    note: "STORE-06 archive — not scheduled",
  };
  await writeFile(path.join(dest, "ARCHIVE.json"), JSON.stringify(marker, null, 2));
  return dest;
}

/** Best-effort read-only import summary — never marks imported jobs runnable. */
export async function importPrototypeReadOnly(
  root: string,
  jobId: string,
): Promise<{ jobId: string; objective: string; runnable: false; warning?: string }> {
  const jobFile = path.join(root, "goals", jobId, "job.json");
  const raw = JSON.parse(await readFile(jobFile, "utf8")) as Record<string, unknown>;
  return {
    jobId: String(raw.jobId ?? jobId),
    objective: String(raw.objective ?? ""),
    runnable: false,
    warning: raw.currentSprintId ? "sprint authority ignored" : undefined,
  };
}
