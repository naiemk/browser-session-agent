/**
 * Suite driver backed by the agent runtime.
 *
 * The same driver serves the mock and live targets: only the model port differs. That is
 * the point — a token-free run exercises the identical code path a paid run does, so a
 * regression in tools, verification, gating, or criteria is caught for free.
 *
 * The driver reports what the agent claimed and what it cost. It never decides the
 * outcome; the runner evaluates the task's criteria afterwards.
 */

import { Ledger } from "../core/ledger.ts";
import type { ApprovalMode } from "../core/gate.ts";
import { runTask, type RunOutcome } from "../runtime/runtime.ts";
import type { ModelPort } from "../runtime/model.ts";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentDriver, DriverContext, DriverOutcome, SuiteTask } from "./types.ts";

/** Provider problems, not agent problems: they must not be scored as failures. */
const INFRA =
  /\b(402|429|5\d\d)\b|credit|rate limit|rate-limit|quota|overloaded|temporarily unavailable|insufficient/i;

export function infrastructureFailure(
  error: string | undefined,
  modelErrors: string[] = [],
): string | undefined {
  return [error, ...modelErrors]
    .filter((entry): entry is string => Boolean(entry))
    .find((entry) => INFRA.test(entry));
}

export interface RuntimeDriverOptions {
  name: string;
  /** A fresh port per task, so per-task plans and per-task budgets are possible. */
  createStream: (task: SuiteTask, origin: string) => ModelPort;
  model?: Model<never>;
  /** Where ledgers and screenshots go. */
  root: string;
  policy?: ApprovalMode;
  /** Answers for `ask_user`, matched by substring of the question. */
  answers?: Record<string, string>;
  approve?: () => Promise<boolean>;
}

export class RuntimeDriver implements AgentDriver {
  readonly name: string;

  constructor(private readonly options: RuntimeDriverOptions) {
    this.name = options.name;
  }

  async runTask(context: DriverContext): Promise<DriverOutcome> {
    const goalId = `suite-${context.task.id}`;
    const ledger = await Ledger.open(this.options.root, goalId);

    const outcome: RunOutcome = await runTask({
      card: {
        objective: context.task.goal,
        criteria: context.task.criteria,
        startUrl: `${context.origin}${context.task.path}`,
        policy: this.options.policy ?? "auto",
      },
      maxTurns: context.task.maxSteps,
      stream: this.options.createStream(context.task, context.origin),
      model: this.options.model,
      tools: {
        browser: context.browser,
        tabId: context.tabId,
        ledger,
        goalRoot: this.options.root,
        goalId,
        policy: this.options.policy ?? "auto",
        screenshotDir: ledger.artifactsDir,
        approve: this.options.approve ?? (async () => true),
        askUser: async (question) =>
          Object.entries(this.options.answers ?? {}).find(([key]) =>
            question.toLowerCase().includes(key.toLowerCase()),
          )?.[1],
        onStep: () => context.step(),
      },
    });

    return {
      claimed: describe(outcome),
      tokens: outcome.tokens || undefined,
      costUsd: outcome.costUsd || undefined,
      infraError: infrastructureFailure(outcome.error, outcome.modelErrors),
    };
  }
}

function describe(outcome: RunOutcome): string {
  if (outcome.error) return `run error: ${outcome.error}`;
  if (outcome.modelErrors.length > 0) return `model error: ${outcome.modelErrors.join(" | ")}`;
  if (outcome.parked) return `parked: ${outcome.parked.reason}`;
  if (outcome.capped) return `capped after ${outcome.turns} turns`;
  if (outcome.report) return `${outcome.report.status}: ${outcome.report.summary}`;
  return "no report filed";
}
