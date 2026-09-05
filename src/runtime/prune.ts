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
import { extractText, observationInContent } from "./wire.ts";

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
  /**
   * What `keepLatest` counts.
   *
   * Per tool while work is live, because the model takes its refs from the newest
   * snapshot and each tool's newest may be the one it is holding. Across all of them for
   * work that is finished, where the question is only whether anything is addressable at
   * all and four snapshots of four dead pages answer it no better than one.
   */
  group?: "tool" | "any";
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

/**
 * Whether this content is a dropped snapshot.
 *
 * The suite still stores a bare string. Everything that goes to a provider is parts.
 * Comparing against the string alone is how compaction looked like it worked while the
 * next GLM turn crashed on `toolMsg.content.filter`.
 */
export function isPlaceholder(content: unknown, placeholder = PLACEHOLDER): boolean {
  return extractText(content) === placeholder;
}

function isPiContentPart(part: unknown): boolean {
  if (!part || typeof part !== "object" || Array.isArray(part)) return false;
  const type = (part as { type?: unknown }).type;
  return type === "text" || type === "image";
}

/**
 * Tool result content as Pi's provider adapters require it: an array of parts.
 *
 * This is not a GLM quirk. OpenAI-compat and Gemini do `content.filter(...)`. Anthropic
 * does `content.some(...)`. A string throws on all of them. Pi only normalises null to
 * `[]`; a string is left as a string.
 *
 * The model never writes this field. Tools, compaction, session restore, and tests do.
 * Wrapping here is how a cheap model and Opus are protected by the same invariant.
 *
 * Already-valid parts arrays are returned as the same reference, so a turn that had
 * nothing to upgrade leaves the prefix exactly as the provider cached it.
 */
export function asPiToolContent(content: unknown): unknown[] {
  if (Array.isArray(content) && content.every(isPiContentPart)) return content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (content == null) return [];
  const text = extractText(content);
  if (text !== undefined) return [{ type: "text", text }];
  return [{ type: "text", text: JSON.stringify(content) }];
}

/**
 * Every tool result, in the shape a provider can serialise.
 *
 * Compaction wrapping only the snapshots it dropped is how the first repair failed:
 * `note_fork`, `ask_user`, `report`, and the newest observe were left as strings, and
 * those are the results still in the request on a follow-up. Call this last, on every
 * path that talks to a provider, including when pruning is off.
 */
export function normalizeToolResultContent<T extends PrunableMessage>(messages: T[]): T[] {
  let changed = false;
  const out = messages.map((message) => {
    if (message.role !== "toolResult") return message;
    const content = asPiToolContent(message.content);
    if (content === message.content) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? out : messages;
}

/**
 * A dropped snapshot, as parts. Always parts.
 *
 * Matching the original shape looked polite and was the remaining hole: a string
 * snapshot became a string placeholder, and GLM crashed on the next turn.
 */
export function placeholderContent(_original?: unknown, placeholder = PLACEHOLDER): unknown[] {
  return [{ type: "text", text: placeholder }];
}

/**
 * Bytes of context for one turn, and where the prompt cache was invalidated.
 *
 * Lives beside pruning because pruning is what rewrites a prefix, and next to
 * `PLACEHOLDER` because that is how a replaced message is recognised. Exported so the
 * accounting is testable without running an agent, and so a host that does not own the
 * loop can do the same sum over whatever context it is shown.
 */
export function measureContext(
  before: readonly PrunableMessage[],
  after: readonly PrunableMessage[],
): { bytes: number; liveBytes: number; placeholderBytes: number; rewrittenFrom: number } {
  let bytes = 0;
  let liveBytes = 0;
  let placeholderBytes = 0;
  let rewrittenFrom = -1;

  for (const [index, message] of after.entries()) {
    const size = JSON.stringify(message ?? null).length;
    bytes += size;
    if (isPlaceholder(message?.content)) placeholderBytes += size;
    else liveBytes += size;

    // Providers cache on an exact prefix. Compare by value: Pi clones the transcript
    // every turn, so a new array with the same parts is not a rewrite, and treating it
    // as one is how rewrittenFrom said 0 on every turn of a run that was caching.
    if (
      rewrittenFrom < 0 &&
      before[index] &&
      before[index]!.content !== message?.content &&
      JSON.stringify(before[index]!.content) !== JSON.stringify(message?.content)
    ) {
      rewrittenFrom = index;
    }
  }

  return { bytes, liveBytes, placeholderBytes, rewrittenFrom };
}

/**
 * Where the current piece of work starts: the operator's most recent message.
 *
 * A chat is a sequence of sub-goals, and the boundary between them is the only place in
 * the transcript where the past reliably stops mattering. Returns 0 when there is nothing
 * but the opening request, because then everything is still the current piece of work.
 */
export function epochStart(messages: readonly PrunableMessage[]): number {
  for (let index = messages.length - 1; index > 0; index--) {
    if (messages[index]!.role === "user") return index;
  }
  return 0;
}

/**
 * Drop the snapshots from finished work, and only when a piece of work finishes.
 *
 * Pruning every turn looks like the obvious saving and is the opposite of one. Providers
 * bill a cached prefix at a fraction of the input price, and rewriting a message near the
 * front invalidates everything after it, so a context trimmed on every turn is a context
 * paid for at full price on every turn. On the measured run that arithmetic came out at
 * roughly two and a half times the cost of leaving it alone: cache reads were 74% of the
 * bill precisely because the prefix was stable.
 *
 * Compacting at a sub-goal boundary pays that penalty once and then leaves the prefix
 * alone. It is also where the drop is safe to make: the snapshots being dropped are of
 * pages the last request was about, not this one.
 *
 * Stable by construction, which is what keeps the cache warm: the answer depends only on
 * where the last user message is, so every turn inside an epoch produces the same prefix,
 * and turns are appended to it rather than rewriting it.
 *
 * What survives is deliberate. Snapshots go; the assistant's own account of what it
 * worked out stays, as does every non-snapshot tool result - which is where `remember`
 * records what was established, so nothing has to be re-derived. One snapshot is kept, so
 * a new sub-goal starts with somewhere to act rather than with nothing addressable.
 */
export function compactFinishedWork<T extends PrunableMessage>(
  messages: T[],
  options: PruneOptions = {},
): T[] {
  const boundary = epochStart(messages);
  const compacted =
    boundary === 0
      ? messages
      : [
          ...pruneMessages(messages.slice(0, boundary), {
            ...options,
            keepLatest: options.keepLatest ?? 1,
            group: options.group ?? "any",
          }),
          ...messages.slice(boundary),
        ];
  // After dropping snapshots, and also when there is nothing to drop: every tool
  // result still has to be parts. The follow-up that used to crash ("Plan better")
  // was a turn whose kept results — forks, questions, reports — were still strings.
  return normalizeToolResultContent(compacted);
}

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
    const group = options.group === "any" ? "any" : (message.toolName ?? "unnamed");
    const count = (seen.get(group) ?? 0) + 1;
    seen.set(group, count);
    if (count <= keepLatest) continue;

    out[index] = {
      ...message,
      content: placeholderContent(message.content, placeholder),
      pruned: true,
    };
  }

  return out;
}
