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
 *
 * Perishability is decided by payload shape, not by tool name. The name-based version
 * covered `observe` and `probe` and silently missed every other tool that returns a
 * snapshot — `act`, `peek`, and the stranger view all did, so their snapshots accumulated
 * untouched and were resent on every subsequent turn. Matching on shape means a tool
 * added later is covered without anyone remembering to register it.
 */

import { PERISHABLE_TOOLS } from "./names.ts";
import { observationInContent } from "./wire.ts";

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
  /** Off only to measure what shape matching is worth. */
  byShape?: boolean;
}

/**
 * A result is perishable when it names a perishable tool or carries a page snapshot.
 *
 * Exported because "which of these messages is stale" is worth testing directly.
 */
export function isPerishable(
  message: PrunableMessage,
  perishable: ReadonlySet<string>,
  byShape = true,
): boolean {
  if (message.toolName && perishable.has(message.toolName)) return true;
  return byShape && Boolean(observationInContent(message.content));
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
    if (message.role !== "toolResult") continue;
    // An error result is the reason a step failed: never prune it.
    if (message.isError) continue;
    if (!isPerishable(message, perishable, options.byShape ?? true)) continue;

    // Grouped by tool so each keeps its own newest result. That matters for more than
    // tidiness: the mock model resolves refs from the newest snapshot in the transcript,
    // and a real agent is in the same position, so the latest action result has to stay.
    const group = message.toolName ?? "unnamed";
    const count = (seen.get(group) ?? 0) + 1;
    seen.set(group, count);
    if (count <= keepLatest) continue;

    out[index] = { ...message, content: placeholder, pruned: true };
  }

  return out;
}
