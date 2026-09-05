/**
 * How a tool result looks on a terminal, as opposed to what the model reads.
 *
 * Those were one string. A page snapshot is the right thing to send a model and the
 * wrong thing to print: forty controls of JSON scrolls the interesting part off screen,
 * and the operator cannot follow their own run. So the payload is unchanged and only the
 * drawing is replaced, with the full text kept in the goal's payload log for anyone who
 * wants it back.
 *
 * This is the Pi-facing adapter, deliberately outside the runtime: the tools must not
 * know what a terminal is, and the summary they are described by is shared with the chat.
 */

import { summarizeToolResult } from "../runtime/summary.ts";
import { extractText } from "../runtime/wire.ts";
import type { Component, RegisteredTool, ToolRenderResultOptions } from "../pi-api.ts";

/** Wrap to width so an expanded payload stays inside the frame instead of over it. */
function wrap(text: string, width: number): string[] {
  const usable = Math.max(20, width - 2);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length <= usable) {
      lines.push(paragraph);
      continue;
    }
    for (let at = 0; at < paragraph.length; at += usable) {
      lines.push(paragraph.slice(at, at + usable));
    }
  }
  return lines;
}

const MAX_EXPANDED_LINES = 200;

/**
 * One line, or the whole payload when the operator asks for it.
 *
 * Expanding reads the model-facing text rather than the summary, because the question
 * being asked at that point is always "what did the model actually see?".
 */
export function renderToolResult(
  result: { content?: unknown; details?: unknown; isError?: boolean },
  options: ToolRenderResultOptions,
  toolName: string,
): Component {
  if (options.expanded) {
    const text = extractText(result.content) ?? "";
    return {
      render: (width: number) => {
        const lines = wrap(text, width);
        return lines.length > MAX_EXPANDED_LINES
          ? [
              ...lines.slice(0, MAX_EXPANDED_LINES),
              `… ${lines.length - MAX_EXPANDED_LINES} more lines, in payloads.jsonl`,
            ]
          : lines;
      },
    };
  }

  const summary = summarizeToolResult(toolName, result.details);
  return { render: () => [summary] };
}

/** Give a composed tool a terminal-friendly result view, changing nothing else. */
export function withToolView(tool: RegisteredTool): RegisteredTool {
  return {
    ...tool,
    renderResult: (result, options) => renderToolResult(result, options, tool.name),
  };
}
