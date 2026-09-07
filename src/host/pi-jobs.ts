import { Type } from "typebox";
import { CoreError } from "../core/types.ts";
import { coreRoot } from "../core/paths.ts";
import { draftFeedback, planConfirmMessage, SPEC_DRAFT_HINT } from "../jobs/spec.ts";
import { JobService } from "../jobs/service.ts";
import { planModeTools } from "./pi-plan-mode.ts";
import { textResult, type ExtensionAPI, type ExtensionContext } from "../pi-api.ts";
import type { JobDurableStatus } from "../jobs/types.ts";

const JOB_TOOLS = ["job_read", "job_update_draft", "job_propose_plan"] as const;
const UNFINISHED_PLAN: JobDurableStatus[] = ["planning", "awaiting_plan_approval"];

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

  const draftPatch = (params: Record<string, unknown>): object => {
    const nested = params.patch;
    if (nested && typeof nested === "object" && !Array.isArray(nested) && Object.keys(nested).length > 0) {
      return nested;
    }
    const { patch: _ignored, ...rest } = params;
    return rest;
  };

  const proposeError = (err: unknown) => {
    if (err instanceof CoreError && err.code === "spec_not_ready") {
      return textResult(
        JSON.stringify({ ready: false, issues: err.details?.issues ?? [], hint: SPEC_DRAFT_HINT }, null, 2),
        {},
        true,
      );
    }
    return textResult(err instanceof Error ? err.message : String(err), {}, true);
  };

  const enablePlanningTools = () => {
    if (toolsBeforePlan === undefined) toolsBeforePlan = pi.getActiveTools();
    pi.setActiveTools([...planModeTools(toolsBeforePlan), ...JOB_TOOLS]);
  };

  const restoreTools = () => {
    if (toolsBeforePlan) pi.setActiveTools(toolsBeforePlan);
    toolsBeforePlan = undefined;
  };

  const userFacingResume = (title: string, status: JobDurableStatus, created = false): string => {
    if (created) {
      return `Started planning "${title}". I'll ask a few questions, then show you a summary to confirm before anything is sent.`;
    }
    if (status === "planning") {
      return `Continuing "${title}". Keep talking here — I'll finish the plan and ask you to confirm before anything is sent.`;
    }
    if (status === "awaiting_plan_approval") {
      return `The plan for "${title}" is ready. Please confirm the summary.`;
    }
    if (status === "paused") return `"${title}" is paused. Say if you want to continue.`;
    if (status === "active") return `Continuing "${title}".`;
    return `This is "${title}".`;
  };

  const offerPlanApproval = async (ctx: ExtensionContext): Promise<"approved" | "declined" | "not_ready"> => {
    if (!activeJobId) return "not_ready";
    const store = await service.resolve(activeJobId);
    const job = await store.readJob();
    if (job.status === "active") {
      notify(ctx, `"${job.title}" is already running.`);
      return "approved";
    }
    let spec;
    try {
      spec = await service.proposePlan(activeJobId);
    } catch {
      return "not_ready";
    }
    const ok = await ctx.ui.confirm("Start this job?", planConfirmMessage(spec));
    if (!ok) {
      notify(ctx, "Okay — nothing will run until you confirm.");
      return "declined";
    }
    await service.approvePlan(activeJobId, spec.hash!);
    restoreTools();
    notify(ctx, `Started "${job.title}".`);
    return "approved";
  };

  const useJob = async (jobId: string, ctx: ExtensionContext, created = false) => {
    const store = await service.resolve(jobId);
    const job = await store.readJob();
    activeJobId = store.jobId;
    persist();
    if (job.status === "planning" || job.status === "awaiting_plan_approval") enablePlanningTools();
    else restoreTools();
    notify(ctx, userFacingResume(job.title, job.status, created));
  };

  const resumeOpenJob = async (ctx: ExtensionContext) => {
    const entries = ctx?.sessionManager?.getEntries?.() ?? [];
    const found = [...entries].reverse().find((entry) => entry.customType === "active-job");
    const remembered = (found?.data as { jobId?: string } | undefined)?.jobId;
    if (remembered) {
      try {
        await useJob(remembered, ctx);
      } catch {
        activeJobId = undefined;
      }
    }
    if (!activeJobId) {
      const allowDiskResume = Boolean(options.root) || !process.env.NODE_TEST_CONTEXT;
      if (allowDiskResume) {
        const unfinished = (await service.list()).filter((job) => UNFINISHED_PLAN.includes(job.status));
        if (unfinished.length === 1) await useJob(unfinished[0]!.jobId, ctx);
      }
    }
    if (!activeJobId) return;
    const job = await (await service.resolve(activeJobId)).readJob();
    if (job.status === "awaiting_plan_approval") await offerPlanApproval(ctx);
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
      await useJob(store.jobId, ctx, true);
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
      notify(
        ctx,
        "Keep talking here. I'll put the plan together and ask you to confirm before anything is sent.",
      );
    },
  });

  pi.registerCommand("job-approve-plan", {
    description: "Confirm the proposed spec and start execution",
    handler: async (_args, ctx) => {
      if (!activeJobId) {
        notify(ctx, "No job in this session yet.");
        return;
      }
      const result = await offerPlanApproval(ctx);
      if (result === "not_ready") notify(ctx, "The plan isn't ready to confirm yet. Keep talking in chat.");
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

  pi.registerCommand("job-scratch", {
    description: "Print the active job's scratch directory (drop a CV or other files here)",
    handler: async (_args, ctx) => {
      if (!activeJobId) return notify(ctx, "Select a job first.");
      notify(ctx, (await service.resolve(activeJobId)).paths().scratchDir);
    },
  });

  pi.registerTool({
    name: "job_read",
    description:
      "Read the active job, draft spec, readiness issues, inbox, and scratchDir. Spec field names: templates[].criteria (not successCriteria); grants are {id,host,gateClass,maxCount}.",
    parameters: Type.Object({}),
    execute: async () => {
      if (!activeJobId) return textResult("No job selected.", {}, true);
      const store = await service.resolve(activeJobId);
      const job = await store.readJob();
      const spec = await store.draftSpec();
      const humans = await store.listHuman();
      return textResult(
        JSON.stringify(
          {
            job,
            spec,
            humans,
            scratchDir: store.paths().scratchDir,
            ...draftFeedback(spec),
          },
          null,
          2,
        ),
      );
    },
  });

  pi.registerTool({
    name: "job_update_draft",
    description:
      "Merge spec fields. Use templates[].criteria (Predicate[]), not successCriteria. Grants: {id, host, gateClass, maxCount}. Returns real readiness issues, not the draft status string.",
    parameters: Type.Object(
      { patch: Type.Optional(Type.Object({}, { additionalProperties: true })) },
      { additionalProperties: true },
    ),
    execute: async (_id, params) => {
      if (!activeJobId) return textResult("No job selected.", {}, true);
      try {
        const spec = await service.updateDraft(activeJobId, draftPatch(params as Record<string, unknown>));
        return textResult(JSON.stringify(draftFeedback(spec), null, 2));
      } catch (err) {
        return proposeError(err);
      }
    },
  });

  pi.registerTool({
    name: "job_propose_plan",
    description:
      "Freeze the draft and show the person a Yes/No confirmation. Do not tell them to type commands. On success they have already confirmed or declined.",
    parameters: Type.Object({}),
    execute: async (_id, _params, _signal, _onUpdate, ctx) => {
      if (!activeJobId) return textResult("No job selected.", {}, true);
      try {
        await service.proposePlan(activeJobId);
        const decision = await offerPlanApproval(ctx);
        if (decision === "approved") {
          return textResult(
            "The user confirmed. The job is now running. Tell them in plain language that you will start; do not mention commands, hashes, or job ids.",
          );
        }
        if (decision === "declined") {
          return textResult("The user declined. Stay in planning. Ask what to change, in plain language.");
        }
        return textResult(
          JSON.stringify({ ready: false, issues: [], hint: SPEC_DRAFT_HINT }, null, 2),
          {},
          true,
        );
      } catch (err) {
        return proposeError(err);
      }
    },
  });

  pi.on("session_start", async (_event: unknown, ctxUnknown: unknown) => {
    const ctx = ctxUnknown as ExtensionContext;
    try {
      await resumeOpenJob(ctx);
    } catch {
      activeJobId = undefined;
    }
  });

  return {
    activeJobId: () => activeJobId,
    injection: async () => (activeJobId ? service.injection(activeJobId) : undefined),
  };
}
