/**
 * Ephemeral observations, using Pi's own `context` hook.
 *
 * A browser task re-looks at the page constantly, and every look is a tool result.
 * Left alone they accumulate until the useful signal is buried. Pi already truncates
 * and compacts, but it cannot know that observation number four supersedes
 * observation number one; only we know that.
 *
 * Superseded results have their *content* replaced rather than being removed.
 * Providers require every tool call to retain a matching tool result, so deleting
 * the message would corrupt the request.
 */

import { DURABLE_TOOLS, PERISHABLE_TOOLS } from "./tool-names.ts";

/** The subset of Pi's message shape this hook needs. */
export interface PrunableMessage {
  role: string;
  toolName?: string;
  isError?: boolean;
  content?: unknown;
  [key: string]: unknown;
}

export interface PruneOptions {
  /** How many recent results of each perishable tool to keep in full. */
  keepLatest?: number;
  perishable?: readonly string[];
  durable?: readonly string[];
  placeholder?: string;
}

export const DEFAULT_PLACEHOLDER =
  "[superseded observation removed to keep context current; observe again if needed]";

export function pruneMessages(
  messages: PrunableMessage[],
  options: PruneOptions = {},
): PrunableMessage[] {
  const keepLatest = options.keepLatest ?? 1;
  const perishable = new Set(options.perishable ?? PERISHABLE_TOOLS);
  const durable = new Set(options.durable ?? DURABLE_TOOLS);
  const placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;

  // Walk backwards so "most recent" is decided before anything is rewritten.
  const seen = new Map<string, number>();
  const out = messages.slice();

  for (let index = out.length - 1; index >= 0; index--) {
    const message = out[index]!;
    const toolName = message.toolName;
    if (!toolName || !perishable.has(toolName)) continue;
    if (durable.has(toolName)) continue;
    // An error result is the reason a step failed: never prune it.
    if (message.isError) continue;

    const count = (seen.get(toolName) ?? 0) + 1;
    seen.set(toolName, count);
    if (count <= keepLatest) continue;

    out[index] = { ...message, content: placeholder, pruned: true };
  }

  return out;
}

export interface PiLikeForContext {
  on(event: "context", handler: (event: { messages: PrunableMessage[] }) => unknown): void;
}

/**
 * Register the hook. Disabled is a first-class option so the suite can measure the
 * agent with and without it rather than assuming it helps.
 */
export function registerContextPruning(
  pi: PiLikeForContext,
  options: PruneOptions & { enabled?: boolean } = {},
): void {
  if (options.enabled === false) return;
  pi.on("context", (event) => ({ messages: pruneMessages(event.messages, options) }));
}
