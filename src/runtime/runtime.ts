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
import { composeAgent, fixedOverhead } from "./agent.ts";
import type { TaskCardInput } from "./card.ts";
import { UsageMeter, withTurnCap, ZERO_USAGE, type ModelPort, type UsageSplit } from "./model.ts";
import {
  measureContext,
  normalizeToolResultContent,
  compactFinishedWork,
  type PrunableMessage,
  type PruneOptions,
} from "./prune.ts";
import type { ReportPayload, ToolContext } from "./tools.ts";

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
  /**
   * Further operator messages in the same run, each a new sub-goal. Compaction fires at
   * these boundaries (D52). The first prompt is the card objective.
   */
  followUps?: string[];
}

export interface RunOutcome {
  report?: ReportPayload;
  parked?: ParkedOutcome;
  turns: number;
  capped: boolean;
  tokens: number;
  costUsd: number;
  /** The same spend, split, because cache reads and fresh input are not billed alike. */
  usage: UsageSplit;
  /** Model or transport failures. Pi surfaces these as error messages, not throws. */
  modelErrors: string[];
  /** Set when the run itself threw. */
  error?: string;
  /**
   * The model answered in prose and took no action at all. Usually a refusal.
   *
   * Without this a decline is indistinguishable from conversation, and the human ends up
   * arguing with a chatbot across many turns while the loop believes nothing happened.
   * Naming it lets the caller respond once, deliberately.
   */
  declined?: string;
  /** Tool calls executed across the whole run. Zero is what makes a decline detectable. */
  toolCalls: number;
}

export const DEFAULT_MAX_TURNS = 16;

/** The record wants the split without the run-level total, which it does not use. */
function splitFields(split: UsageSplit): Omit<UsageSplit, "totalTokens"> {
  return {
    inputTokens: split.inputTokens,
    outputTokens: split.outputTokens,
    cacheReadTokens: split.cacheReadTokens,
    cacheWriteTokens: split.cacheWriteTokens,
    costUsd: split.costUsd,
  };
}

export async function runTask(options: RuntimeOptions): Promise<RunOutcome> {
  const maxTurns = options.maxTurns ?? options.card.maxTurns ?? DEFAULT_MAX_TURNS;

  let report: ReportPayload | undefined;
  let parked: ParkedOutcome | undefined;

  // One source: metering is part of the run's evidence, not a separate option that can
  // disagree with it.
  const metrics = options.tools.evidence.metrics;
  // Incremented when the context is built, which is the start of a turn, so tool results
  // and provider usage from the same turn share an index and the rollup can join them.
  let currentTurn = 0;

  // Composed, not assembled here: the product builds the same agent from the same call,
  // so the two cannot drift apart again.
  const composed = composeAgent({
    card: options.card,
    maxTurns,
    tools: {
      ...options.tools,
      turn: () => currentTurn,
      onReport: (value) => {
        report = value;
        options.tools.onReport?.(value);
      },
      onParked: (value) => {
        parked = value;
        options.tools.onParked?.(value);
      },
    },
  });
  const tools = composed.tools;

  const meter = new UsageMeter();
  const modelErrors: string[] = [];
  const assistantText: string[] = [];
  let turns = 0;
  let toolCalls = 0;

  // Pi's engine has no step limit, so the budget is enforced at the model port.
  const { stream, state: cap } = withTurnCap(options.stream, maxTurns);

  const card = composed.systemPrompt;
  const model = options.model ?? MOCK_MODEL;

  // The card and the schemas are resent on every turn, so their size is a per-turn cost
  // rather than a one-off. Recorded once because it does not change during a run.
  metrics.record({
    kind: "run",
    at: new Date().toISOString(),
    model: `${(model as { provider?: string }).provider ?? "?"}/${(model as { id?: string }).id ?? "?"}`,
    ...fixedOverhead(composed),
    maxTurns,
  });

  const agent = new Agent({
    initialState: {
      systemPrompt: card,
      model,
      thinkingLevel: "minimal",
      tools: tools as AgentTool[],
    },
    streamFn: stream,
    transformContext: async (messages) => {
      currentTurn += 1;
      const compacted =
        options.prune === false
          ? messages
          : compactFinishedWork(messages as never[], options.prune);
      // Shape is not optional with pruning. A suite task on an OpenAI-compat model
      // crashes the same way the chat did if a tool result is still a string.
      const shaped = normalizeToolResultContent(compacted as unknown as PrunableMessage[]);
      const measured = measureContext(
        messages as unknown as PrunableMessage[],
        shaped,
      );
      metrics.record({ kind: "context", turn: currentTurn, ...measured, messages: shaped.length });
      return shaped as unknown as typeof messages;
    },
  });

  const unsubscribe = agent.subscribe((event) => {
    const value = event as {
      type?: string;
      message?: {
        role?: string;
        stopReason?: string;
        errorMessage?: string;
        usage?: unknown;
        content?: Array<{ type?: string; text?: string }>;
      };
    };
    if (value.type === "turn_end") {
      turns += 1;
      return;
    }
    if (value.type === "tool_execution_start") {
      toolCalls += 1;
      return;
    }
    if (value.type === "message_end" && value.message) {
      const split = meter.add(value.message as never);
      if (split) metrics.record({ kind: "turn", turn: currentTurn, ...splitFields(split) });
      if (value.message.errorMessage) modelErrors.push(value.message.errorMessage);
      else if (value.message.stopReason === "error") {
        modelErrors.push("model returned an error with no message");
      }
      if (value.message.role === "assistant") {
        for (const part of value.message.content ?? []) {
          if (part?.type === "text" && part.text) assistantText.push(part.text);
        }
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
    for (const followUp of options.followUps ?? []) {
      await agent.prompt({
        role: "user",
        content: [{ type: "text", text: followUp }],
        timestamp: Date.now(),
      } as never);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    unsubscribe();
    await metrics.flush();
  }

  // Prose and no action: the model answered instead of working. Only meaningful when
  // nothing went wrong technically, otherwise the error is the story.
  const declined =
    toolCalls === 0 && !report && !parked && !error && modelErrors.length === 0
      ? assistantText.join("\n\n").trim() || undefined
      : undefined;

  return {
    report,
    parked,
    turns,
    capped: cap.capped,
    tokens: meter.tokens,
    costUsd: meter.costUsd,
    usage: meter.split,
    modelErrors,
    error,
    declined,
    toolCalls,
  };
}

export interface DeclineRetryOptions extends RuntimeOptions {
  /**
   * Facts to attach on a second attempt, usually whatever the agent has established about
   * the situation so far.
   */
  factsOnRetry?: () => Promise<Record<string, unknown>>;
}

/**
 * Run a task, and if the model declined without acting, try exactly once more with the
 * established facts attached.
 *
 * Once, deliberately. A retry loop that keeps rephrasing until a model agrees is a machine
 * for talking models out of correct refusals. If the facts do not change the answer, the
 * answer stands and the caller tells the human.
 */
export async function runTaskWithDeclineRetry(
  options: DeclineRetryOptions,
): Promise<{ outcome: RunOutcome; attempts: number; firstDecline?: string }> {
  const first = await runTask(options);
  if (!first.declined) return { outcome: first, attempts: 1 };

  const facts = (await options.factsOnRetry?.()) ?? {};
  if (Object.keys(facts).length === 0) {
    return { outcome: first, attempts: 1, firstDecline: first.declined };
  }

  const second = await runTask({
    ...options,
    card: {
      ...options.card,
      knownFacts: { ...options.card.knownFacts, ...facts },
    },
  });

  return { outcome: second, attempts: 2, firstDecline: first.declined };
}

export { ZERO_USAGE };
