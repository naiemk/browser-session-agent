import { Type } from "typebox";
import { coreRoot } from "../core/paths.ts";
import { JobService } from "../jobs/service.ts";
import { planModeTools } from "./pi-plan-mode.ts";
import { textResult, type ExtensionAPI, type ExtensionContext } from "../pi-api.ts";

const JOB_TOOLS = ["job_read", "job_update_draft", "job_propose_plan"] as const;

export interface JobBindOptions {
  root?: string;
  headless?: boolean;
  service?: JobService;
}

export interface JobBindHandle {
  activeJobId: () => string | undefined;
  injection: () => Promise<string | undefined>;
}

function parseFlag(args: string, name: string): { value?: string; rest: string } {
  const match = args.match(new RegExp(`--${name}\\s+(\\S+)`));
  if (!match) return { rest: args.trim() };
  return { value: match[1], rest: args.replace(match[0], "").trim() };
}

export function bindJobCommands(pi: ExtensionAPI, options: JobBindOptions = {}): JobBindHandle {
  const service = options.service ?? new JobService({ root: options.root ?? coreRoot() });
  const headless = options.headless ?? process.env.BSA_HEADLESS === "1";
  let activeJobId: string | undefined;
  let toolsBeforePlan: string[] | undefined;

  const persist = () => {
    pi.appendEntry?.("active-job", { jobId: activeJobId });
  };

  const notify = (ctx: ExtensionContext, message: string) => ctx.ui.notify(message, "info");

  const enablePlanningTools = () => {
    if (toolsBeforePlan === undefined) toolsBeforePlan = pi.getActiveTools();
    pi.setActiveTools([...planModeTools(toolsBeforePlan), ...JOB_TOOLS]);
  };

  const restoreTools = () => {
    if (toolsBeforePlan) pi.setActiveTools(toolsBeforePlan);
    toolsBeforePlan = undefined;
  };

  const useJob = async (jobId: string, ctx: ExtensionContext) => {
    const store = await service.resolve(jobId);
    const job = await store.readJob();
    activeJobId = store.jobId;
    persist();
    if (job.status === "planning" || job.status === "awaiting_plan_approval") enablePlanningTools();
    else restoreTools();
    notify(ctx, `Using ${job.title} (${job.jobId}) · ${job.status}`);
  };

  pi.registerCommand("jobs", {
    description: "List durable long-running jobs",
    handler: async (_args, ctx) => {
      const jobs = await service.list();
      if (jobs.length === 0) {
        notify(ctx, "No jobs. /job-new <objective> to start one.");
        return;
      }
      notify(
        ctx,
        jobs
          .map(
            (job) =>
              `${job.jobId}  ${job.title}  ${job.display}  humans:${job.humanCount}` +
              (job.nextWakeAt ? `  wake ${job.nextWakeAt}` : ""),
          )
          .join("\n"),
      );
    },
  });

  pi.registerCommand("job-new", {
    description: "Create a long-running job. Usage: /job-new [--title NAME] <objective>",
    handler: async (args, ctx) => {
      const parsed = parseFlag(args, "title");
      if (!parsed.rest) {
        notify(ctx, "Usage: /job-new [--title NAME] <objective>");
        return;
      }
      const store = await service.create(parsed.rest, parsed.value);
      await useJob(store.jobId, ctx);
    },
  });

  pi.registerCommand("job-use", {
    description: "Select a job by id prefix",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        notify(ctx, "Usage: /job-use <id>");
        return;
      }
      await useJob(args.trim(), ctx);
    },
  });

  pi.registerCommand("job-title", {
    description: "Rename the active job",
    handler: async (args, ctx) => {
      if (!activeJobId || !args.trim()) {
        notify(ctx, "Usage: /job-title <name> (with a job selected)");
        return;
      }
      const job = await service.rename(activeJobId, args.trim());
      notify(ctx, `Title is now ${job.title}`);
    },
  });

  pi.registerCommand("job-status", {
    description: "Show the active job",
    handler: async (_args, ctx) => {
      if (!activeJobId) {
        notify(ctx, "No job selected.");
        return;
      }
      const summary = await (await service.resolve(activeJobId)).summary();
      notify(ctx, JSON.stringify(summary, null, 2));
    },
  });

  pi.registerCommand("job-plan", {
    description: "Enter planning tools for the active job",
    handler: async (_args, ctx) => {
      if (!activeJobId) {
        notify(ctx, "Select a job first.");
        return;
      }
      enablePlanningTools();
      notify(ctx, "Planning tools on. Update the draft, then /job-approve-plan.");
    },
  });

  pi.registerCommand("job-approve-plan", {
    description: "Confirm the proposed spec hash and start execution",
    handler: async (_args, ctx) => {
      if (!activeJobId) {
        notify(ctx, "Select a job first.");
        return;
      }
      let spec = await (await service.resolve(activeJobId)).draftSpec();
      if (spec.status !== "proposed") {
        try {
          spec = await service.proposePlan(activeJobId);
        } catch (err) {
          notify(ctx, err instanceof Error ? err.message : String(err));
          return;
        }
      }
      const ok = await ctx.ui.confirm(
        "Approve job plan",
        `${spec.objective}\nHash ${spec.hash}\nIn: ${spec.inScope.join("; ")}\nTurns/task ${spec.budgets.maxTurnsPerTask}`,
      );
      if (!ok) {
        notify(ctx, "Plan not approved.");
        return;
      }
      await service.approvePlan(activeJobId, spec.hash!);
      restoreTools();
      notify(ctx, `Approved ${spec.hash}. Job is active.`);
    },
  });

  pi.registerCommand("job-run", {
    description: "Run ticks until idle (needs a live model via CLI for now)",
    handler: async (_args, ctx) => {
      notify(
        ctx,
        activeJobId
          ? `Run ticks with: browser-agent job run ${activeJobId}`
          : "Select a job, then run browser-agent job run <id>",
      );
    },
  });

  pi.registerCommand("job-inbox", {
    description: "Show human-attention items",
    handler: async (_args, ctx) => {
      if (!activeJobId) {
        notify(ctx, "Select a job first.");
        return;
      }
      const items = await service.inbox(activeJobId);
      const open = items.filter((item) => item.status !== "resolved");
      if (open.length === 0) {
        notify(ctx, "Inbox empty.");
        return;
      }
      const grouped = new Map<string, typeof open>();
      for (const item of open) {
        const key = `${item.kind}:${item.resource}`;
        grouped.set(key, [...(grouped.get(key) ?? []), item]);
      }
      const lines = [...grouped.entries()].map(
        ([key, list]) => `${key} ×${list.length}\n` + list.map((item) => `  ${item.id} ${item.status} ${item.reason}`).join("\n"),
      );
      notify(ctx, lines.join("\n"));
    },
  });

  pi.registerCommand("job-human", {
    description: "Work the next human-attention item",
    handler: async (_args, ctx) => {
      if (!activeJobId) {
        notify(ctx, "Select a job first.");
        return;
      }
      const items = await service.inbox(activeJobId);
      const waiting = items.filter((item) => item.status === "waiting");
      const next = waiting.find((item) => item.kind === "challenge" || item.kind === "identity") ?? waiting[0];
      if (!next) {
        notify(ctx, "No waiting human items.");
        return;
      }
      if (next.perishable && headless) {
        notify(ctx, "Headless mode cannot take over a live challenge. Re-run headed.");
        return;
      }
      if (next.perishable || next.kind === "challenge" || next.kind === "identity") {
        const ready = await service.prepareHuman(activeJobId, next.id);
        notify(ctx, `Browser is yours for ${ready.id}: ${ready.reason}\n${ready.handoff}`);
        const done = await ctx.ui.confirm("Human task", "Mark this item resolved after you acted?");
        if (done) await service.answerHuman(activeJobId, ready.id, "operator completed takeover");
        return;
      }
      const answer = await ctx.ui.input(next.reason, next.handoff);
      if (answer) await service.answerHuman(activeJobId, next.id, answer);
    },
  });

  pi.registerCommand("job-pause", {
    description: "Pause the active job",
    handler: async (_args, ctx) => {
      if (!activeJobId) return notify(ctx, "Select a job first.");
      await service.pause(activeJobId);
      notify(ctx, "Paused.");
    },
  });

  pi.registerCommand("job-resume", {
    description: "Resume a paused job",
    handler: async (_args, ctx) => {
      if (!activeJobId) return notify(ctx, "Select a job first.");
      await service.resume(activeJobId);
      notify(ctx, "Active.");
    },
  });

  pi.registerCommand("job-revise", {
    description: "Open a new spec draft and pause execution",
    handler: async (_args, ctx) => {
      if (!activeJobId) return notify(ctx, "Select a job first.");
      const spec = await service.revise(activeJobId);
      enablePlanningTools();
      notify(ctx, `Draft spec v${spec.version}. Approve again before running.`);
    },
  });

  pi.registerCommand("job-rollover", {
    description: "Force the next sprint on the next tick",
    handler: async (_args, ctx) => {
      notify(ctx, "Sprint rollover happens automatically when the current sprint is exhausted.");
    },
  });

  pi.registerTool({
    name: "job_read",
    description: "Read the active job record, draft spec, and inbox.",
    parameters: Type.Object({}),
    execute: async () => {
      if (!activeJobId) return textResult("No job selected.", {}, true);
      const store = await service.resolve(activeJobId);
      const job = await store.readJob();
      const spec = await store.draftSpec();
      const humans = await store.listHuman();
      return textResult(JSON.stringify({ job, spec, humans }, null, 2));
    },
  });

  pi.registerTool({
    name: "job_update_draft",
    description: "Merge fields into the draft spec. Cannot edit an approved spec.",
    parameters: Type.Object({ patch: Type.Object({}, { additionalProperties: true }) }),
    execute: async (_id, params) => {
      if (!activeJobId) return textResult("No job selected.", {}, true);
      try {
        const spec = await service.updateDraft(activeJobId, (params.patch ?? params) as never);
        return textResult(JSON.stringify({ version: spec.version, issues: spec.status }, null, 2));
      } catch (err) {
        return textResult(err instanceof Error ? err.message : String(err), {}, true);
      }
    },
  });

  pi.registerTool({
    name: "job_propose_plan",
    description: "Validate readiness and freeze a hash for operator approval.",
    parameters: Type.Object({}),
    execute: async () => {
      if (!activeJobId) return textResult("No job selected.", {}, true);
      try {
        const spec = await service.proposePlan(activeJobId);
        return textResult(`Proposed hash ${spec.hash}. Operator must /job-approve-plan.`);
      } catch (err) {
        return textResult(err instanceof Error ? err.message : String(err), {}, true);
      }
    },
  });

  pi.on("session_start", async (_event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    const entries = ctx?.sessionManager?.getEntries?.() ?? [];
    const found = [...entries].reverse().find((entry) => entry.customType === "active-job");
    const jobId = (found?.data as { jobId?: string } | undefined)?.jobId;
    if (jobId) {
      try {
        await useJob(jobId, ctx);
      } catch {
        activeJobId = undefined;
      }
    }
  });

  return {
    activeJobId: () => activeJobId,
    injection: async () => (activeJobId ? service.injection(activeJobId) : undefined),
  };
}
