/**
 * Ephemeral observations.
 *
 * A browser task re-looks at the page constantly and each look is a tool result. Left
 * alone they accumulate until the useful signal is buried, and every one is resent on
 * every turn. Pi truncates and compacts, but it cannot know that observation four
 * supersedes observation one; only we know that.
 *
 * Superseded results have their content replaced, never removed: providers require every
 * tool call to keep a matching result, so deleting the message corrupts the request.
 */

import { PERISHABLE_TOOLS } from "./names.ts";

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
  placeholder?: string;
}

export const PLACEHOLDER = "[stale snapshot dropped; observe again if you need it]";

export function pruneMessages<T extends PrunableMessage>(
  messages: T[],
  options: PruneOptions = {},
): T[] {
  const keepLatest = options.keepLatest ?? 1;
  const perishable = new Set(options.perishable ?? PERISHABLE_TOOLS);
  const placeholder = options.placeholder ?? PLACEHOLDER;

  const seen = new Map<string, number>();
  const out = messages.slice();

  // Backwards, so "most recent" is decided before anything is rewritten.
  for (let index = out.length - 1; index >= 0; index--) {
    const message = out[index]!;
    const toolName = message.toolName;
    if (!toolName || !perishable.has(toolName)) continue;
    // An error result is the reason a step failed: never prune it.
    if (message.isError) continue;

    const count = (seen.get(toolName) ?? 0) + 1;
    seen.set(toolName, count);
    if (count <= keepLatest) continue;

    out[index] = { ...message, content: placeholder, pruned: true };
  }

  return out;
}
