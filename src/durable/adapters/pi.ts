/**
 * CAMPAIGN-04-T01 — thin Pi adapter over JobApplicationService.
 * Fresh chat does not bind a job; commands are explicit.
 */

import path from "node:path";
import type { ExtensionAPI } from "../../pi-api.ts";
import { coreRoot } from "../../core/paths.ts";
import { SqliteJobRepository } from "../infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../application/service.ts";
import { FakeKernel, type ExecutionHost } from "../ports/execution-kernel.ts";

function hostFromEnv(): ExecutionHost | null {
  if (process.env.BSA_DURABLE_HOST !== "1") return null;
  return {
    available: true,
    profileKey: "pi-local",
    nowIso: () => new Date().toISOString(),
    kernel: new FakeKernel(async () => ({ status: "completed", value: { ok: true }, evidenceIds: [] })),
  };
}

export function registerDurablePiCommands(pi: ExtensionAPI, options?: { root?: string }): void {
  const root = options?.root ?? coreRoot();
  const db = path.join(root, "durable", "control.sqlite");

  const withService = async <T>(fn: (service: JobApplicationService, repo: SqliteJobRepository) => Promise<T>): Promise<T> => {
    const repo = SqliteJobRepository.open(db);
    try {
      const service = new JobApplicationService(repo, hostFromEnv);
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
        ctx.ui.notify(JSON.stringify(results), unavailable ? "error" : "info");
        return;
      }
      if (!text) {
        ctx.ui.notify("durable-tick needs <jobId> or --due", "error");
        return;
      }
      const result = await withService((s) => s.tick(text));
      ctx.ui.notify(JSON.stringify(result), result.status === "runtime_unavailable" ? "error" : "info");
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
