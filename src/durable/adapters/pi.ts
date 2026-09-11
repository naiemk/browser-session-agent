/**
 * CAMPAIGN-04-T01 / R2.1 — thin Pi adapter over JobApplicationService.
 * Fresh chat does not bind a job; commands are explicit.
 * Host is injected; default is null (runtime_unavailable). No fake completed kernel.
 * Magpie / hosted chat bind is R2.2 (`src/host/pi-durable.ts`).
 */

import path from "node:path";
import type { ExtensionAPI } from "../../pi-api.ts";
import { coreRoot } from "../../core/paths.ts";
import { SqliteJobRepository } from "../infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../application/service.ts";
import type { ExecutionHost } from "../ports/execution-kernel.ts";
import { REMEDIATION_NO_HOST } from "../infrastructure/product-host.ts";

export interface DurablePiOptions {
  root?: string;
  /** Product or test host. Default: always null (ADAPTER-04). */
  hostFactory?: () => ExecutionHost | null;
  /** Copy when tick reports runtime_unavailable. */
  remediation?: string | (() => string);
}

function resolveRemediation(remediation: string | (() => string)): string {
  return typeof remediation === "function" ? remediation() : remediation;
}

export function registerDurablePiCommands(pi: ExtensionAPI, options?: DurablePiOptions): void {
  const root = options?.root ?? coreRoot();
  const db = path.join(root, "durable", "control.sqlite");
  const hostFactory = options?.hostFactory ?? (() => null);
  const remediation = options?.remediation ?? REMEDIATION_NO_HOST;

  const withService = async <T>(fn: (service: JobApplicationService, repo: SqliteJobRepository) => Promise<T>): Promise<T> => {
    const repo = SqliteJobRepository.open(db);
    try {
      const service = new JobApplicationService(repo, hostFactory);
      return await fn(service, repo);
    } finally {
      repo.close();
    }
  };

  pi.registerCommand("durable-status", {
    description: "Show durable Jobs V2 status for an explicit job id (does not bind chat).",
    handler: async (_args, ctx) => {
      const jobId = String(_args ?? "").trim();
      if (!jobId) {
        ctx.ui.notify("durable-status needs <jobId>", "error");
        return;
      }
      const status = await withService((s) => s.status(jobId));
      ctx.ui.notify(JSON.stringify(status), "info");
    },
  });

  pi.registerCommand("durable-tick", {
    description: "Tick one durable job or --due (runtime_unavailable when host missing).",
    handler: async (args, ctx) => {
      const text = String(args ?? "").trim();
      if (text === "--due" || text.startsWith("--due")) {
        const results = await withService((s) => s.tickDue());
        const unavailable = results.some((r) => r.status === "runtime_unavailable");
        const note = resolveRemediation(remediation);
        // Prefer surface remediation over dispatcher CLI copy (ADAPTER-04 overlay).
        const annotated = results.map((r) =>
          r.status === "runtime_unavailable" ? { ...r, detail: note } : r,
        );
        ctx.ui.notify(JSON.stringify(annotated), unavailable ? "error" : "info");
        return;
      }
      if (!text) {
        ctx.ui.notify("durable-tick needs <jobId> or --due", "error");
        return;
      }
      const result = await withService((s) => s.tick(text));
      const note = resolveRemediation(remediation);
      const annotated =
        result.status === "runtime_unavailable"
          ? { ...result, detail: note }
          : result;
      ctx.ui.notify(JSON.stringify(annotated), result.status === "runtime_unavailable" ? "error" : "info");
    },
  });

  pi.registerCommand("durable-cancel", {
    description: "Cancel a durable job by explicit id.",
    handler: async (args, ctx) => {
      const jobId = String(args ?? "").trim();
      if (!jobId) {
        ctx.ui.notify("durable-cancel needs <jobId>", "error");
        return;
      }
      const result = await withService((s) => s.cancel({ type: "CancelJob", jobId }));
      ctx.ui.notify(JSON.stringify(result), "info");
    },
  });
}

/** True when no durable job is implicitly bound to the session. */
export function durableChatBinding(): { boundJobId: undefined } {
  return { boundJobId: undefined };
}
