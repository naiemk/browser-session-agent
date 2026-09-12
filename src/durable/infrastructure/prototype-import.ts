/**
 * STORE-06 / CAMPAIGN-R2-E4 — prototype import/archive with dry-run and quarantine.
 * Spec owner path: docs/jobs-v2-spec.md STORE-06.
 * Never schedules; import stays runnable: false. Malformed is refused.
 */

import { access } from "node:fs/promises";
import path from "node:path";
import {
  archivePrototypeJob as writeArchiveMarker,
  importPrototypeReadOnly as readImportSummary,
  validatePrototypeRoot,
  type PrototypeValidationReport,
} from "./prototype/validate.ts";

export {
  validatePrototypeRoot,
  type PrototypeValidationReport,
} from "./prototype/validate.ts";

export type PrototypeJobClass = "ok" | "malformed" | "unsupported" | "missing";

export interface PrototypeImportResult {
  jobId: string;
  objective: string;
  runnable: false;
  class: PrototypeJobClass;
  dryRun: boolean;
  warning?: string;
  reason?: string;
}

export interface PrototypeArchiveResult {
  jobId: string;
  dest: string;
  runnable: false;
  class: PrototypeJobClass;
  dryRun: boolean;
  wrote: boolean;
  reason?: string;
}

function classifyJob(report: PrototypeValidationReport, jobId: string): PrototypeJobClass {
  if (report.malformed.some((row) => row.jobId === jobId)) return "malformed";
  if (report.unsupported.some((row) => row.jobId === jobId)) return "unsupported";
  if (report.ok.includes(jobId)) return "ok";
  return "missing";
}

function malformedReason(report: PrototypeValidationReport, jobId: string): string | undefined {
  return report.malformed.find((row) => row.jobId === jobId)?.reason;
}

function unsupportedReason(report: PrototypeValidationReport, jobId: string): string | undefined {
  return report.unsupported.find((row) => row.jobId === jobId)?.reason;
}

/** Read-only import summary. Malformed / missing → refused (caller exits nonzero). */
export async function importPrototypeReadOnly(
  root: string,
  jobId: string,
  options: { dryRun?: boolean } = {},
): Promise<PrototypeImportResult> {
  const dryRun = Boolean(options.dryRun);
  const report = await validatePrototypeRoot(root);
  const jobClass = classifyJob(report, jobId);

  if (jobClass === "malformed") {
    return {
      jobId,
      objective: "",
      runnable: false,
      class: "malformed",
      dryRun,
      reason: malformedReason(report, jobId) ?? "malformed",
    };
  }
  if (jobClass === "missing") {
    return {
      jobId,
      objective: "",
      runnable: false,
      class: "missing",
      dryRun,
      reason: "job directory not found or not a prototype job_*",
    };
  }
  if (jobClass === "unsupported") {
    return {
      jobId,
      objective: "",
      runnable: false,
      class: "unsupported",
      dryRun,
      reason: unsupportedReason(report, jobId) ?? "unsupported; archive only",
      warning: "sprint authority present; import refused — archive only",
    };
  }

  const summary = await readImportSummary(root, jobId);
  return {
    jobId: summary.jobId,
    objective: summary.objective,
    runnable: false,
    class: "ok",
    dryRun,
    warning: summary.warning,
  };
}

/** Archive marker. Dry-run reports dest without mkdir/write. Malformed refused. */
export async function archivePrototypeJob(
  root: string,
  jobId: string,
  archiveRoot: string,
  options: { dryRun?: boolean } = {},
): Promise<PrototypeArchiveResult> {
  const dryRun = Boolean(options.dryRun);
  const report = await validatePrototypeRoot(root);
  const jobClass = classifyJob(report, jobId);
  const dest = path.join(archiveRoot, jobId);

  if (jobClass === "malformed") {
    return {
      jobId,
      dest,
      runnable: false,
      class: "malformed",
      dryRun,
      wrote: false,
      reason: malformedReason(report, jobId) ?? "malformed",
    };
  }
  if (jobClass === "missing") {
    return {
      jobId,
      dest,
      runnable: false,
      class: "missing",
      dryRun,
      wrote: false,
      reason: "job directory not found or not a prototype job_*",
    };
  }

  // ok and unsupported may archive (unsupported is archive-only path).
  if (dryRun) {
    return {
      jobId,
      dest,
      runnable: false,
      class: jobClass,
      dryRun: true,
      wrote: false,
      reason: jobClass === "unsupported" ? unsupportedReason(report, jobId) : undefined,
    };
  }

  const written = await writeArchiveMarker(root, jobId, archiveRoot);
  return {
    jobId,
    dest: written,
    runnable: false,
    class: jobClass,
    dryRun: false,
    wrote: true,
    reason: jobClass === "unsupported" ? unsupportedReason(report, jobId) : undefined,
  };
}

/** True when an archive dest already has ARCHIVE.json (tests / operators). */
export async function archiveMarkerExists(archiveRoot: string, jobId: string): Promise<boolean> {
  try {
    await access(path.join(archiveRoot, jobId, "ARCHIVE.json"));
    return true;
  } catch {
    return false;
  }
}
