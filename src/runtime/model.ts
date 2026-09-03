/**
 * The model port.
 *
 * `pi-agent-core`'s `Agent` takes a `streamFn`, which is the one seam that lets us keep
 * its real turn loop while replacing the thing that costs money. Everything downstream
 * of this port — tool execution, error-to-text, truncation, steering — runs identically
 * whether the model is a live provider or a local mock.
 *
 * `createAgentSession` from pi-coding-agent hardcodes its stream function, which is why
 * the runtime builds on the lower-level Agent instead.
 */

import type { AgentOptions } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model, Usage } from "@earendil-works/pi-ai";

/** Signature of `streamSimple`, which is what `Agent.streamFn` expects. */
export type ModelPort = NonNullable<AgentOptions["streamFn"]>;

export const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as unknown as Usage;

export interface ModelChoice {
  provider: string;
  id: string;
}

/**
 * Cheap enough to run a suite, capable enough that a failure says something about our
 * environment rather than about the model.
 */
export const LIVE_MODEL_PREFERENCE = [
  "openrouter/google/gemini-2.5-flash",
  "openrouter/anthropic/claude-haiku-4.5",
  "openrouter/anthropic/claude-3.5-haiku",
  "openrouter/openai/gpt-4o-mini",
];

/** Provider to the environment variables that may carry its key, in priority order. */
export const KEY_ENV_NAMES: Record<string, string[]> = {
  openrouter: ["OPENROUTER_API_KEY", "open_router_api_key"],
  anthropic: ["ANTHROPIC_API_KEY", "anthropic_api_key"],
  openai: ["OPENAI_API_KEY", "openai_api_key"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY", "google_api_key", "gemini_api_key"],
  "ai-gateway": ["AI_GATEWAY_API_KEY", "ai_gateway_api_key"],
};

export function resolveKey(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const name of KEY_ENV_NAMES[provider] ?? []) {
    const value = env[name];
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
}

export function pickModel(
  available: Array<{ provider?: string; id?: string }>,
  preferred?: string,
): (Model<never> & ModelChoice) | undefined {
  const name = (model: { provider?: string; id?: string }) => `${model.provider}/${model.id}`;
  for (const candidate of [preferred, ...LIVE_MODEL_PREFERENCE].filter(Boolean)) {
    const found = available.find((model) => name(model) === candidate);
    if (found) return found as Model<never> & ModelChoice;
  }
  return undefined;
}

export interface LiveModel {
  model: Model<never>;
  stream: ModelPort;
  name: string;
}

/**
 * Live provider access. Kept out of the mock path entirely: nothing here is imported or
 * initialised when tests run, so a test run cannot accidentally reach a provider.
 */
export async function createLiveModel(options: { model?: string } = {}): Promise<LiveModel> {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");

  // The catalog of the models we prefer is fetched, not static, so the network has to be
  // allowed here or `getAvailable` comes back with builtins only.
  const runtime = await ModelRuntime.create({ allowModelNetwork: true });

  for (const provider of Object.keys(KEY_ENV_NAMES)) {
    const key = resolveKey(provider);
    if (key) await runtime.setRuntimeApiKey(provider, key);
  }

  const available = [...(await runtime.getAvailable())];
  const model = pickModel(available as never[], options.model);
  if (!model) {
    throw new Error(
      "No model available. Set OPENROUTER_API_KEY (or another provider key) and try again. " +
        "Token-free runs use --target mock.",
    );
  }

  // `streamSimple` resolves credentials and headers per request itself, so there is no key
  // plumbing to get wrong here.
  const stream: ModelPort = (target, context, streamOptions) =>
    runtime.streamSimple(target as never, context, streamOptions as never);

  return { model: model as Model<never>, stream, name: `${model.provider}/${model.id}` };
}

export interface TurnCapState {
  readonly limit: number;
  turns: number;
  capped: boolean;
}

/**
 * Enforce a turn budget at the model port.
 *
 * Pi's engine has no step limit, and aborting from inside a `turn_end` listener only
 * signals the provider — a stream that ignores the signal keeps the loop running. Capping
 * here is both simpler and engine-friendly: once the budget is spent the port returns a
 * turn with no tool calls, and the loop ends because the model stopped asking for tools.
 * It also costs nothing, since the capped turn never reaches a provider.
 */
export function withTurnCap(
  stream: ModelPort,
  limit: number,
  onCap?: (state: TurnCapState) => void,
): { stream: ModelPort; state: TurnCapState } {
  const state: TurnCapState = { limit, turns: 0, capped: false };

  const capped: ModelPort = (model, context, options) => {
    if (state.turns >= limit) {
      if (!state.capped) {
        state.capped = true;
        onCap?.(state);
      }
      return createStopStream(
        `Turn budget of ${limit} exhausted. Stopping without a result.`,
      );
    }
    state.turns += 1;
    return stream(model, context, options);
  };

  return { stream: capped, state };
}

/** A turn with no tool calls, which is how the loop is told to stop. */
export async function createStopStream(text: string): Promise<never> {
  const { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");
  const stream = createAssistantMessageEventStream();
  const message = {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "openai-completions",
    provider: "mock",
    model: "cap",
    usage: ZERO_USAGE,
    stopReason: "stop" as const,
    timestamp: Date.now(),
  } as unknown as AssistantMessage;
  stream.push({ type: "start", partial: message });
  stream.push({ type: "done", reason: "stop", message });
  return stream as never;
}

/** Cost and token totals accumulated across a run. */
export class UsageMeter {
  tokens = 0;
  costUsd = 0;

  add(message: AssistantMessage): void {
    const usage = message.usage as
      | (Usage & { totalTokens?: number; cost?: { total?: number } })
      | undefined;
    if (!usage) return;
    this.tokens += usage.totalTokens ?? 0;
    this.costUsd += usage.cost?.total ?? 0;
  }
}
