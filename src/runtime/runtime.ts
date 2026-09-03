/**
 * The agent runtime: one bounded task, one loop, one model port.
 *
 * Built on `pi-agent-core`'s `Agent` rather than pi-coding-agent's `createAgentSession`
 * for two reasons. First, `createAgentSession` hardcodes its stream function, so the
 * model cannot be replaced and every test would cost tokens. Second, it drags in a
 * resource loader, session files, settings, and auth that a bounded browser task does
 * not need. What is left here is small enough to read in one sitting.
 *
 * Pi's loop is untouched: tool execution, error-to-text, and queueing all behave exactly
 * as they do in production, whichever model port is plugged in.
 */

import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { ParkedOutcome } from "../core/types.ts";
import { buildTaskCard, type TaskCardInput } from "./card.ts";
import { UsageMeter, withTurnCap, ZERO_USAGE, type ModelPort } from "./model.ts";
import { pruneMessages, type PruneOptions } from "./prune.ts";
import { buildTools, type ReportPayload, type ToolContext } from "./tools.ts";

/** Placeholder model descriptor for the mock port, which never calls a provider. */
export const MOCK_MODEL = {
  provider: "mock",
  id: "mock",
  api: "openai-completions",
  name: "mock",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200_000,
  maxTokens: 8_192,
} as unknown as Model<never>;

export interface RuntimeOptions {
  card: TaskCardInput;
  tools: ToolContext;
  stream: ModelPort;
  model?: Model<never>;
  maxTurns?: number;
  prune?: PruneOptions | false;
}

export interface RunOutcome {
  report?: ReportPayload;
  parked?: ParkedOutcome;
  turns: number;
  capped: boolean;
  tokens: number;
  costUsd: number;
  /** Model or transport failures. Pi surfaces these as error messages, not throws. */
  modelErrors: string[];
  /** Set when the run itself threw. */
  error?: string;
}

export const DEFAULT_MAX_TURNS = 16;

export async function runTask(options: RuntimeOptions): Promise<RunOutcome> {
  const maxTurns = options.maxTurns ?? options.card.maxTurns ?? DEFAULT_MAX_TURNS;

  let report: ReportPayload | undefined;
  let parked: ParkedOutcome | undefined;

  const tools = buildTools({
    ...options.tools,
    onReport: (value) => {
      report = value;
      options.tools.onReport?.(value);
    },
    onParked: (value) => {
      parked = value;
      options.tools.onParked?.(value);
    },
  });

  const meter = new UsageMeter();
  const modelErrors: string[] = [];
  let turns = 0;

  // Pi's engine has no step limit, so the budget is enforced at the model port.
  const { stream, state: cap } = withTurnCap(options.stream, maxTurns);

  const agent = new Agent({
    initialState: {
      systemPrompt: buildTaskCard({ ...options.card, maxTurns }),
      model: options.model ?? MOCK_MODEL,
      thinkingLevel: "minimal",
      tools: tools as AgentTool[],
    },
    streamFn: stream,
    transformContext: async (messages) =>
      options.prune === false ? messages : pruneMessages(messages as never[], options.prune),
  });

  const unsubscribe = agent.subscribe((event) => {
    const value = event as {
      type?: string;
      message?: { stopReason?: string; errorMessage?: string; usage?: unknown };
    };
    if (value.type === "turn_end") {
      turns += 1;
      return;
    }
    if (value.type === "message_end" && value.message) {
      meter.add(value.message as never);
      if (value.message.errorMessage) modelErrors.push(value.message.errorMessage);
      else if (value.message.stopReason === "error") {
        modelErrors.push("model returned an error with no message");
      }
    }
  });

  let error: string | undefined;
  try {
    await agent.prompt({
      role: "user",
      content: [{ type: "text", text: options.card.objective }],
      timestamp: Date.now(),
    } as never);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    unsubscribe();
  }

  return {
    report,
    parked,
    turns,
    capped: cap.capped,
    tokens: meter.tokens,
    costUsd: meter.costUsd,
    modelErrors,
    error,
  };
}

export { ZERO_USAGE };
