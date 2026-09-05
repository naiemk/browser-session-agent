/**
 * The last thing that touches tool results before a provider serialises them.
 *
 * Compaction used to do this as a courtesy, which is why the first fix did not hold:
 * wrapping lived in the optional optimiser, so turning compaction off, or any other
 * writer leaving a string, sent a string to the model. Pi's adapters then crash —
 * OpenAI-compat and Gemini on `.filter`, Anthropic on `.some`. GLM was the messenger,
 * not the author. The model never writes `toolResult.content`; we do.
 *
 * Always on, and registered after compaction, so a regression in any earlier handler
 * still cannot reach a provider.
 */

import type { ExtensionAPI } from "../pi-api.ts";
import { normalizeToolResultContent, type PrunableMessage } from "../runtime/prune.ts";

export function shapePiToolResults(pi: ExtensionAPI): void {
  pi.on("context", (event: unknown) => {
    const messages = (event as { messages?: unknown })?.messages;
    if (!Array.isArray(messages)) return undefined;

    const shaped = normalizeToolResultContent(messages as PrunableMessage[]);
    return shaped === messages ? undefined : { messages: shaped };
  });
}
