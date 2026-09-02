import { browserOperatorPrompt } from "../../host/browser-agent-prompt.ts";

/** Hosted-API helpers for Pi: cap huge OpenRouter maxTokens and surface turn errors. */

export const HOSTED_MAX_OUTPUT_TOKENS = 8192;

export function capHostedModelOutput(
  model: { maxTokens?: number } | undefined,
  cap = HOSTED_MAX_OUTPUT_TOKENS,
): void {
  if (model && typeof model.maxTokens === "number" && model.maxTokens > cap) {
    model.maxTokens = cap;
  }
}

export function applyHostedApiKeys(auth: {
  setRuntimeApiKey?: (provider: string, key: string) => void;
}): void {
  if (typeof auth.setRuntimeApiKey !== "function") return;
  const keys: Array<[string, string | undefined]> = [
    ["openrouter", process.env.OPENROUTER_API_KEY],
    ["anthropic", process.env.ANTHROPIC_API_KEY],
    ["openai", process.env.OPENAI_API_KEY],
    ["google", process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY],
    ["ai-gateway", process.env.AI_GATEWAY_API_KEY],
  ];
  for (const [provider, key] of keys) {
    if (key) auth.setRuntimeApiKey(provider, key);
  }
}

export function assistantErrorFromEvent(event: unknown): string | undefined {
  const value = event as {
    type?: string;
    message?: { errorMessage?: string; stopReason?: string };
    messages?: Array<{ errorMessage?: string; stopReason?: string }>;
    assistantMessageEvent?: { type?: string; errorMessage?: string };
  };
  const parts = [
    value.message,
    ...(Array.isArray(value.messages) ? value.messages : []),
  ];
  for (const msg of parts) {
    if (msg?.errorMessage) return msg.errorMessage;
    if (msg?.stopReason === "error") return "The model returned an error with no message.";
  }
  if (value.assistantMessageEvent?.errorMessage) return value.assistantMessageEvent.errorMessage;
  return undefined;
}

/** Loader options that replace Pi's coding-agent identity for the hosted operator. */
export function hostedResourceLoaderOptions(base: {
  cwd: string;
  agentDir: string;
  additionalExtensionPaths?: string[];
}): {
  cwd: string;
  agentDir: string;
  additionalExtensionPaths?: string[];
  noSkills: true;
  noContextFiles: true;
  systemPrompt: string;
  appendSystemPromptOverride: () => string[];
  agentsFilesOverride: () => { agentsFiles: Array<{ path: string; content: string }> };
} {
  return {
    ...base,
    noSkills: true,
    noContextFiles: true,
    systemPrompt: browserOperatorPrompt(),
    appendSystemPromptOverride: () => [],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  };
}

export function normalizeAgentEvent(event: unknown): Record<string, unknown> {
  const value = event as {
    type?: string;
    assistantMessageEvent?: { type?: string; delta?: string; text?: string };
    message?: unknown;
    toolName?: string;
    tool?: { name?: string };
    name?: string;
  };
  if (value.type === "message_update" && value.assistantMessageEvent) {
    const inner = value.assistantMessageEvent;
    if (inner.type === "text_delta") {
      return { type: "text_delta", text: inner.delta ?? inner.text ?? "" };
    }
    if (inner.type === "thinking_delta") {
      return { type: "thinking_delta", text: inner.delta ?? inner.text ?? "" };
    }
  }
  if (value.type === "tool_execution_start" || value.type === "tool_call") {
    const toolName = value.toolName ?? value.tool?.name ?? value.name;
    return { ...value, type: value.type, toolName };
  }
  if (value.type) return { ...value };
  return { type: "agentEvent", event };
}
