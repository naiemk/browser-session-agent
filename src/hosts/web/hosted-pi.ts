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

export async function applyHostedApiKeys(auth: {
  setRuntimeApiKey?: (provider: string, key: string) => void | Promise<void>;
}): Promise<void> {
  if (typeof auth.setRuntimeApiKey !== "function") return;
  const keys: Array<[string, string | undefined]> = [
    ["openrouter", process.env.OPENROUTER_API_KEY],
    ["anthropic", process.env.ANTHROPIC_API_KEY],
    ["openai", process.env.OPENAI_API_KEY],
    ["google", process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY],
    ["ai-gateway", process.env.AI_GATEWAY_API_KEY],
  ];
  for (const [provider, key] of keys) {
    if (key) await auth.setRuntimeApiKey(provider, key);
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
