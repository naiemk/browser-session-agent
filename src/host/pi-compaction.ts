/**
 * Dropping finished work from the context of a session Pi drives.
 *
 * Pi compacts when the window fills, and it truncates individual results, but it cannot
 * know that a page snapshot from two sub-goals ago describes a page nobody is on. Only we
 * know which tool results perish, so only we can say when they have.
 *
 * This is an optimiser, not a serialiser. Tool-result *shape* belongs in `shapePiToolResults`,
 * which stays registered when this is turned off. Putting the GLM crash-fix here is how
 * the first repair missed every result compaction does not drop.
 *
 * Registered before shape and metering. Pi hands each handler what the previous one returned.
 */

import type { ExtensionAPI } from "../pi-api.ts";
import { compactFinishedWork, type PrunableMessage, type PruneOptions } from "../runtime/prune.ts";

export interface CompactionOptions extends PruneOptions {
  /** Off to measure what compaction is worth, not to make it optional in the product. */
  enabled?: boolean;
}

export function compactPiContext(pi: ExtensionAPI, options: CompactionOptions = {}): void {
  if (options.enabled === false) return;

  pi.on("context", (event: unknown) => {
    const messages = (event as { messages?: unknown })?.messages;
    if (!Array.isArray(messages)) return undefined;

    const compacted = compactFinishedWork(messages as PrunableMessage[], options);
    // Returning the same array when nothing changed keeps the intent legible: a turn
    // inside a piece of work is a turn that leaves the prefix exactly as the provider
    // cached it.
    return compacted === messages ? undefined : { messages: compacted };
  });
}
