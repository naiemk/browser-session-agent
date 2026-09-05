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

const MAX_EXPANDED_LINES = 200;

/**
 * Pi's TUI throws if any rendered line is wider than the terminal:
 * `Rendered line N exceeds terminal width (111 > 45)`.
 *
 * The summary is clipped to 110 characters for the chat, which is not a width. A
 * 45-column pane is a real one. `render()` is given that pane; every line we return
 * has to fit it. We do not import pi-tui for this: drawing one line must not put a
 * TUI library in the package graph.
 */
export function fitLine(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return "…";
  return `${text.slice(0, width - 1)}…`;
}

/** Wrap so every line is at most `width`, including the last fragment. */
export function wrapToWidth(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    for (let at = 0; at < paragraph.length; at += width) {
      lines.push(paragraph.slice(at, at + width));
    }
  }
  return lines;
}

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
        const lines = wrapToWidth(text, width);
        const shown =
          lines.length > MAX_EXPANDED_LINES
            ? [
                ...lines.slice(0, MAX_EXPANDED_LINES),
                `… ${lines.length - MAX_EXPANDED_LINES} more lines, in payloads.jsonl`,
              ]
            : lines;
        return shown.map((line) => fitLine(line, width));
      },
    };
  }

  const summary = summarizeToolResult(toolName, result.details);
  return { render: (width) => [fitLine(summary, width)] };
}

/** Give a composed tool a terminal-friendly result view, changing nothing else. */
export function withToolView(tool: RegisteredTool): RegisteredTool {
  return {
    ...tool,
    renderResult: (result, options) => renderToolResult(result, options, tool.name),
  };
}
