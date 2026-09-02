/**
 * The real Pi-backed session.
 *
 * Pi's turn engine is reused untouched: it already loops over tool calls, truncates
 * tool output, compacts long context, and feeds tool errors back as text. What we
 * supply is the boundary — one task, one fresh in-memory session, exactly our tools,
 * the task card as the whole system prompt, plus a turn cap and pruning.
 *
 * `noTools: "all"` matters: without it Pi enables read, bash, edit, and write, and the
 * model would try to solve a browser task by editing files.
 */

import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  defineTool,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import type { CreateSession, CreateSessionOptions, SessionHandle } from "./task-session.ts";

/** Provider to the environment variables that may carry its key, in priority order. */
export const KEY_ENV_NAMES: Record<string, string[]> = {
  openrouter: ["OPENROUTER_API_KEY", "open_router_api_key"],
  anthropic: ["ANTHROPIC_API_KEY", "anthropic_api_key"],
  openai: ["OPENAI_API_KEY", "openai_api_key"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY", "google_api_key", "gemini_api_key"],
  "ai-gateway": ["AI_GATEWAY_API_KEY", "ai_gateway_api_key"],
};

export function resolveKey(provider: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of KEY_ENV_NAMES[provider] ?? []) {
    const value = env[name];
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
}

/**
 * Runtime API keys from the environment, so no credential is written to disk.
 * Snake-case names are accepted because secret managers inject them that way.
 */
export function applyRuntimeKeys(
  auth: { setRuntimeApiKey?: (provider: string, key: string) => void },
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (typeof auth.setRuntimeApiKey !== "function") return [];
  const applied: string[] = [];
  for (const provider of Object.keys(KEY_ENV_NAMES)) {
    const key = resolveKey(provider, env);
    if (!key) continue;
    auth.setRuntimeApiKey(provider, key);
    applied.push(provider);
  }
  return applied;
}

export interface PiSessionConfig {
  cwd?: string;
  agentDir?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Cap the model's output so one verbose turn cannot blow the context window. */
  maxOutputTokens?: number;
  /** `provider/id`. Without this Pi picks the registry's first entry, which is arbitrary. */
  model?: string;
}

/**
 * Preference order for a suite run: cheap enough to run the whole suite, capable
 * enough that failures say something about our environment rather than the model.
 */
export const DEFAULT_MODEL_PREFERENCE = [
  "openrouter/google/gemini-2.5-flash",
  "openrouter/anthropic/claude-haiku-4.5",
  "openrouter/anthropic/claude-3.5-haiku",
  "openrouter/openai/gpt-4o-mini",
];

export function selectModel(
  registry: { getAvailable: () => Array<{ provider?: string; id?: string }> },
  preferred?: string,
): { provider?: string; id?: string } | undefined {
  const available = registry.getAvailable();
  const name = (model: { provider?: string; id?: string }) => `${model.provider}/${model.id}`;
  for (const candidate of [preferred, ...DEFAULT_MODEL_PREFERENCE].filter(Boolean)) {
    const found = available.find((model) => name(model) === candidate);
    if (found) return found;
  }
  return undefined;
}

export function createPiSessionFactory(config: PiSessionConfig = {}): CreateSession {
  return async (options: CreateSessionOptions): Promise<SessionHandle> => {
    const cwd = config.cwd ?? process.cwd();
    // Both the loader and the session require a real path here, not undefined.
    const agentDir = config.agentDir ?? getAgentDir();

    const authStorage = AuthStorage.create();
    applyRuntimeKeys(authStorage as never);
    const modelRegistry = ModelRegistry.create(authStorage);

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      // The card is the entire prompt: no coding identity, no skills, no AGENTS.md.
      systemPrompt: options.systemPrompt,
      appendSystemPromptOverride: () => [],
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      noSkills: true,
      noContextFiles: true,
      noPromptTemplates: true,
      extensionFactories: [
        (pi: { on: (event: string, handler: (event: never, ctx: never) => unknown) => void }) => {
          options.register(pi);
        },
      ],
    } as never);
    await loader.reload();

    const customTools = options.tools.map((tool) =>
      defineTool({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        promptSnippet: tool.promptSnippet,
        parameters: tool.parameters as never,
        execute: async (toolCallId: string, params: unknown) => {
          const result = await tool.execute(toolCallId, (params ?? {}) as Record<string, unknown>);
          return { ...result, details: result.details ?? {} };
        },
      } as never),
    );

    const model = selectModel(modelRegistry as never, config.model);

    const created = await createAgentSession({
      cwd,
      agentDir,
      authStorage,
      modelRegistry,
      ...(model ? { model } : {}),
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(cwd),
      customTools: customTools as never,
      noTools: "all",
      tools: options.toolNames,
      thinkingLevel: config.thinkingLevel ?? "low",
    } as never);

    const session = created.session as {
      prompt: (text: string) => Promise<void>;
      dispose: () => void;
      bindExtensions?: (bindings: Record<string, unknown>) => Promise<void>;
      getSessionStats?: () => { totalTokens?: number; totalCostUsd?: number; cost?: number };
      model?: { maxTokens?: number };
    };

    await session.bindExtensions?.({});

    const modelErrors: string[] = [];
    const subscribable = session as unknown as {
      subscribe?: (listener: (event: unknown) => void) => () => void;
    };
    subscribable.subscribe?.((event) => {
      const value = event as {
        type?: string;
        message?: { stopReason?: string; errorMessage?: string };
      };
      if (value.type !== "message_end") return;
      const message = value.message;
      if (!message) return;
      if (message.errorMessage) modelErrors.push(message.errorMessage);
      else if (message.stopReason === "error") modelErrors.push("model returned an error with no message");
    });

    if (config.maxOutputTokens && session.model && typeof session.model.maxTokens === "number") {
      session.model.maxTokens = Math.min(session.model.maxTokens, config.maxOutputTokens);
    }

    return {
      prompt: (text: string) => session.prompt(text),
      dispose: () => session.dispose(),
      usage: () => {
        const stats = session.getSessionStats?.() ?? {};
        return {
          tokens: stats.totalTokens,
          costUsd: stats.totalCostUsd ?? stats.cost,
        };
      },
      errors: () => [...modelErrors],
    };
  };
}
