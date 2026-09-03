/**
 * The mock model.
 *
 * This is the piece that makes the agent testable. It implements the same event-stream
 * protocol a real provider does, so `pi-agent-core`'s loop runs exactly as it does in
 * production: tools execute for real, against a real browser, with real verification and
 * a real commit gate. The only thing replaced is the part that costs money and varies.
 *
 * Two modes:
 *   - `plan`: a list of intended tool calls, with targets named rather than ref'd. Refs
 *     are resolved at call time from the newest observation in the transcript, which is
 *     what a real agent has to do, so the resolution path is exercised too.
 *   - `script`: raw turns, for reproducing awkward behaviour on purpose — a model that
 *     claims success without acting, one that repeats a failing click, one that errors.
 */

import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AssistantMessage, Context, ToolCall } from "@earendil-works/pi-ai";
import { TOOL_ACT, TOOL_DONE, TOOL_OBSERVE } from "./names.ts";
import { ZERO_USAGE, type ModelPort } from "./model.ts";
import type { WireObservation } from "./wire.ts";

/** One intended tool call. `target` is matched against control names at call time. */
export interface PlanStep {
  tool: string;
  args?: Record<string, unknown>;
  /** Substring of the control's accessible name; resolved to a ref when the call is made. */
  target?: string;
  /** Skip this step unless the predicate holds against the newest observation. */
  when?: (observation: WireObservation) => boolean;
  /** Repeat while the predicate holds, up to `maxRepeat` times. */
  repeatWhile?: (observation: WireObservation) => boolean;
  maxRepeat?: number;
}

export interface MockTurn {
  text?: string;
  calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  /** Emit a provider-style failure instead of a normal turn. */
  error?: string;
}

export interface MockModelOptions {
  plan?: PlanStep[];
  script?: MockTurn[];
  /** Reported per turn, so cost accounting can be exercised without a provider. */
  usagePerTurn?: { tokens?: number; costUsd?: number };
  onTurn?: (info: { turn: number; calls: string[] }) => void;
  /**
   * The exact context the model was handed, after pruning. Useful for asserting what a
   * turn actually costs, which is otherwise invisible.
   */
  onContext?: (context: Context, turn: number) => void;
}

interface MockState {
  turn: number;
  stepIndex: number;
  repeats: number;
}

function assistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
  usage: { tokens?: number; costUsd?: number } | undefined,
): AssistantMessage {
  const total = usage?.tokens ?? 0;
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "mock",
    model: "mock",
    usage: {
      ...ZERO_USAGE,
      input: Math.floor(total / 2),
      output: Math.ceil(total / 2),
      totalTokens: total,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: usage?.costUsd ?? 0,
      },
    } as AssistantMessage["usage"],
    stopReason,
    timestamp: Date.now(),
  };
}

/** The newest observation the transcript contains, as the model would see it. */
export function latestObservation(context: Context): WireObservation | undefined {
  const messages = context.messages as Array<{
    role?: string;
    toolName?: string;
    content?: unknown;
  }>;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== "toolResult") continue;
    const text = extractText(message.content);
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as WireObservation & { observation?: WireObservation };
      const candidate = parsed.observation ?? parsed;
      if (candidate && Array.isArray(candidate.controls)) return candidate;
    } catch {
      // not JSON, or not an observation
    }
  }
  return undefined;
}

function extractText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter((part): part is { type: string; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text"),
    )
    .map((part) => part.text);
  return parts.length > 0 ? parts.join("") : undefined;
}

function resolveRef(observation: WireObservation | undefined, target: string): string | undefined {
  if (!observation) return undefined;
  const exact = observation.controls.find((control) => control.name === target);
  if (exact) return exact.ref;
  return observation.controls.find((control) => control.name.includes(target))?.ref;
}

/**
 * Turn a plan into turns. Each turn issues one tool call, which keeps the transcript
 * shaped like a real agent's and lets each step react to the previous result.
 */
function nextPlanTurn(
  plan: PlanStep[],
  state: MockState,
  context: Context,
): MockTurn {
  const observation = latestObservation(context);

  while (state.stepIndex < plan.length) {
    const step = plan[state.stepIndex]!;

    if (step.when && observation && !step.when(observation)) {
      state.stepIndex += 1;
      state.repeats = 0;
      continue;
    }

    if (step.repeatWhile) {
      const shouldRepeat = observation ? step.repeatWhile(observation) : true;
      const exhausted = state.repeats >= (step.maxRepeat ?? 10);
      if (!shouldRepeat || exhausted) {
        state.stepIndex += 1;
        state.repeats = 0;
        continue;
      }
      state.repeats += 1;
    } else {
      state.stepIndex += 1;
    }

    // A named target needs a fresh snapshot before it can be resolved.
    if (step.target && !observation) {
      if (!step.repeatWhile) state.stepIndex -= 1;
      return { calls: [{ name: TOOL_OBSERVE, arguments: {} }] };
    }

    const args = { ...(step.args ?? {}) };
    if (step.target) {
      const ref = resolveRef(observation, step.target);
      if (!ref) {
        return {
          calls: [
            {
              name: TOOL_DONE,
              arguments: {
                status: "failed",
                summary: `mock plan could not find a control named "${step.target}"`,
              },
            },
          ],
        };
      }
      args.ref = ref;
    }

    return { calls: [{ name: step.tool, arguments: args }] };
  }

  return {
    calls: [{ name: TOOL_DONE, arguments: { status: "success", summary: "mock plan complete" } }],
  };
}

/**
 * Build a model port. Returns a stream that emits `start`, the content blocks, then
 * `done`, which is the contract the loop consumes.
 */
export function createMockModel(options: MockModelOptions): ModelPort {
  const state: MockState = { turn: 0, stepIndex: 0, repeats: 0 };

  return (model, context, streamOptions) => {
    const stream = createAssistantMessageEventStream();

    // A real provider rejects when the run is aborted; behave the same way so abort
    // semantics are exercised rather than assumed.
    if (streamOptions?.signal?.aborted) {
      const aborted = assistantMessage([], "aborted", options.usagePerTurn);
      aborted.errorMessage = "aborted";
      stream.push({ type: "start", partial: aborted });
      stream.push({ type: "error", reason: "aborted", error: aborted } as never);
      return stream;
    }

    const turnIndex = state.turn++;
    options.onContext?.(context, turnIndex);

    const turn: MockTurn = options.script
      ? (options.script[turnIndex] ?? {
          calls: [
            {
              name: TOOL_DONE,
              arguments: { status: "failed", summary: "mock script exhausted" },
            },
          ],
        })
      : nextPlanTurn(options.plan ?? [], state, context);

    options.onTurn?.({
      turn: turnIndex,
      calls: (turn.calls ?? []).map((call) => call.name),
    });

    if (turn.error) {
      const failed = assistantMessage([], "error", options.usagePerTurn);
      failed.errorMessage = turn.error;
      stream.push({ type: "start", partial: failed });
      stream.push({ type: "error", reason: "error", error: failed } as never);
      return stream;
    }

    const content: AssistantMessage["content"] = [];
    if (turn.text) content.push({ type: "text", text: turn.text });
    const calls: ToolCall[] = (turn.calls ?? []).map((call, index) => ({
      type: "toolCall",
      id: `mock_${turnIndex}_${index}`,
      name: call.name,
      arguments: call.arguments,
    }));
    content.push(...calls);

    const message = assistantMessage(
      content,
      calls.length > 0 ? "toolUse" : "stop",
      options.usagePerTurn,
    );

    stream.push({ type: "start", partial: message });
    if (turn.text) {
      stream.push({ type: "text_start", contentIndex: 0, partial: message });
      stream.push({ type: "text_delta", contentIndex: 0, delta: turn.text, partial: message });
      stream.push({
        type: "text_end",
        contentIndex: 0,
        content: turn.text,
        partial: message,
      });
    }
    for (const [index, call] of calls.entries()) {
      const contentIndex = (turn.text ? 1 : 0) + index;
      stream.push({ type: "toolcall_start", contentIndex, partial: message });
      stream.push({ type: "toolcall_end", contentIndex, toolCall: call, partial: message });
    }
    stream.push({
      type: "done",
      reason: calls.length > 0 ? "toolUse" : "stop",
      message,
    });

    void model;
    return stream;
  };
}

/** Convenience for the common shape: act on a named control. */
export function actStep(
  kind: string,
  target: string | undefined,
  args: Record<string, unknown> = {},
): PlanStep {
  return { tool: TOOL_ACT, target, args: { kind, ...args } };
}
