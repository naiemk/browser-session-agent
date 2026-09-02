/**
 * Suite driver that runs a real agent, so the scoreboard measures the thing we are
 * actually building rather than a reference solution.
 *
 * The driver reports what the agent claimed and how much it cost. It never decides
 * the outcome: the runner evaluates the task's criteria afterwards (D20).
 */

import { Ledger } from "../core/ledger.ts";
import { TaskStore } from "../core/task.ts";
import { runBoundedTask } from "../agent/task-session.ts";
import type { CreateSession } from "../agent/task-session.ts";
import type { ApprovalMode } from "../core/gate.ts";
import type { AgentDriver, DriverContext, DriverOutcome } from "./types.ts";

export interface AgentDriverOptions {
  createSession: CreateSession;
  /** Where ledgers and artifacts go. */
  root: string;
  name?: string;
  policy?: ApprovalMode;
  /** Answers to `browser_ask_user`, keyed by substring of the question. */
  answers?: Record<string, string>;
  approve?: () => Promise<boolean>;
}

export class SuiteAgentDriver implements AgentDriver {
  readonly name: string;

  constructor(private readonly options: AgentDriverOptions) {
    this.name = options.name ?? "agent";
  }

  async runTask(context: DriverContext): Promise<DriverOutcome> {
    const goalId = `suite-${context.task.id}`;
    const ledger = await Ledger.open(this.options.root, goalId);
    const store = await TaskStore.open(this.options.root, goalId);

    // The task is recorded with its criteria so the run is auditable afterwards.
    await store.create({
      objective: context.task.goal,
      criteria: [...context.task.criteria],
      maxTurns: context.task.maxSteps,
    });

    const result = await runBoundedTask({
      card: {
        objective: context.task.goal,
        criteria: context.task.criteria,
        startUrl: `${context.origin}${context.task.path}`,
        policy: this.options.policy ?? "auto",
      },
      maxTurns: context.task.maxSteps,
      createSession: this.options.createSession,
      tools: {
        browser: context.browser,
        tabId: context.tabId,
        ledger,
        goalRoot: this.options.root,
        goalId,
        policy: this.options.policy ?? "auto",
        screenshotDir: ledger.artifactsDir,
        approve: this.options.approve ?? (async () => true),
        askUser: async (question) => {
          const match = Object.entries(this.options.answers ?? {}).find(([key]) =>
            question.toLowerCase().includes(key.toLowerCase()),
          );
          return match?.[1];
        },
        step: () => context.step(),
      },
    });

    const claimed = result.error
      ? `session error: ${result.error}`
      : result.parked
        ? `parked: ${result.parked.reason}`
        : result.report
          ? `${result.report.status}: ${result.report.summary}`
          : "no report filed";

    return {
      claimed,
      tokens: result.tokens,
      costUsd: result.costUsd,
      infraError: infrastructureFailure(result.error, result.modelErrors),
    };
  }
}

/**
 * Provider problems, not agent problems. Exhausted credits and rate limits are the
 * common ones; scoring them would blame the agent for the bill and quietly depress
 * every future comparison.
 */
const INFRA = /\b(402|429|5\d\d)\b|credit|rate limit|rate-limit|quota|overloaded|temporarily unavailable|insufficient/i;

export function infrastructureFailure(
  error: string | undefined,
  modelErrors: string[] = [],
): string | undefined {
  const candidates = [error, ...modelErrors].filter((entry): entry is string => Boolean(entry));
  return candidates.find((entry) => INFRA.test(entry));
}
