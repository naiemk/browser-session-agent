/**
 * One bounded Pi session per task.
 *
 * Pi's loop is reused as-is; only its boundaries are ours. A task gets a fresh
 * in-memory session, the task card as its entire system prompt, exactly the browser
 * tools, a turn cap, and context pruning. When the task ends the session is disposed,
 * so nothing leaks into the next one.
 *
 * `createSession` is injectable so the wiring can be asserted without a live model.
 * Whether a fresh session per task beats one long compacted session is an open
 * question (D27) settled by running the suite both ways, not by preference.
 */

import { buildTaskCard, type TaskCardInput } from "./task-card.ts";
import { registerContextPruning, type PruneOptions } from "./context-pruning.ts";
import { registerTurnCap, type TurnCapState } from "./turn-cap.ts";
import { buildTools, type AgentToolDefinition, type ToolDeps, type TaskResultReport } from "./tools.ts";
import type { ParkedOutcome } from "../core/types.ts";

export interface SessionHandle {
  prompt(text: string): Promise<void>;
  dispose(): void;
  usage?: () => { tokens?: number; costUsd?: number };
  /**
   * Model-level failures. Pi surfaces these as error assistant messages rather than
   * thrown exceptions, so without this a rate limit is indistinguishable from an agent
   * that decided to do nothing.
   */
  errors?: () => string[];
}

export interface CreateSessionOptions {
  systemPrompt: string;
  tools: AgentToolDefinition[];
  toolNames: string[];
  maxTurns: number;
  /** Hooks registered on the session, kept separate so they can be switched off. */
  register: (pi: {
    on: (event: string, handler: (event: never, ctx: never) => unknown) => void;
  }) => void;
}

export type CreateSession = (options: CreateSessionOptions) => Promise<SessionHandle>;

export interface RunTaskOptions {
  card: TaskCardInput;
  tools: ToolDeps;
  createSession: CreateSession;
  maxTurns?: number;
  prune?: PruneOptions & { enabled?: boolean };
  turnCapEnabled?: boolean;
}

export interface RunTaskResult {
  report?: TaskResultReport;
  parked?: ParkedOutcome;
  turns: TurnCapState;
  tokens?: number;
  costUsd?: number;
  /** Set when the session itself failed rather than the task. */
  error?: string;
  modelErrors?: string[];
}

export async function runBoundedTask(options: RunTaskOptions): Promise<RunTaskResult> {
  const maxTurns = options.maxTurns ?? options.card.maxTurns ?? 20;
  let report: TaskResultReport | undefined;
  let parked: ParkedOutcome | undefined;

  const tools = buildTools({
    ...options.tools,
    onResult: (value) => {
      report = value;
      options.tools.onResult?.(value);
    },
    onParked: (value) => {
      parked = value;
      options.tools.onParked?.(value);
    },
  });

  let turns: TurnCapState = { limit: maxTurns, turns: 0, capped: false };

  const session = await options.createSession({
    systemPrompt: buildTaskCard({ ...options.card, maxTurns }),
    tools,
    toolNames: tools.map((tool) => tool.name),
    maxTurns,
    register: (pi) => {
      registerContextPruning(pi as never, { ...options.prune });
      turns = registerTurnCap(pi as never, maxTurns, {
        enabled: options.turnCapEnabled,
      });
    },
  });

  let error: string | undefined;
  try {
    await session.prompt(options.card.objective);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    const usage = session.usage?.();
    const modelErrors = session.errors?.() ?? [];
    session.dispose();
    return {
      report,
      parked,
      turns,
      tokens: usage?.tokens,
      costUsd: usage?.costUsd,
      error: error ?? (modelErrors.length > 0 ? modelErrors.join(" | ") : undefined),
      modelErrors,
    };
  }
}
