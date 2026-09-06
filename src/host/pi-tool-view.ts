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
/** Widget lines have no pane width; keep them inside a typical TUI footer. */
export const WIDGET_LINE_MAX = 80;

/**
 * Pi's TUI throws if any rendered line is wider than the terminal:
 * `Rendered line N exceeds terminal width (111 > 45)`.
 *
 * Width here is terminal columns, not `string.length`. CJK and many emoji are two
 * columns. We do not import pi-tui for this: drawing one line must not put a TUI
 * library in the package graph.
 */
export function codePointWidth(code: number): number {
  if (code === 0 || code === 0x200b) return 0;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (code >= 0x0300 && code <= 0x036f) return 0;
  if (code >= 0x1ab0 && code <= 0x1aff) return 0;
  if (code >= 0x1dc0 && code <= 0x1dff) return 0;
  if (code >= 0x20d0 && code <= 0x20ff) return 0;
  if (code >= 0xfe00 && code <= 0xfe0f) return 0;
  if (code >= 0xfe20 && code <= 0xfe2f) return 0;
  if (code >= 0xe0100 && code <= 0xe01ef) return 0;
  if (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x3fffd))
  ) {
    return 2;
  }
  return 1;
}

export function visibleWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += codePointWidth(char.codePointAt(0) ?? 0);
  }
  return width;
}

export function fitLine(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  if (width === 1) return "…";
  let taken = "";
  let used = 0;
  const budget = width - 1;
  for (const char of text) {
    const next = codePointWidth(char.codePointAt(0) ?? 0);
    if (used + next > budget) break;
    taken += char;
    used += next;
  }
  return `${taken}…`;
}

/** Wrap so every line is at most `width` columns, including the last fragment. */
export function wrapToWidth(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    let used = 0;
    for (const char of paragraph) {
      const next = codePointWidth(char.codePointAt(0) ?? 0);
      if (used > 0 && used + next > width) {
        lines.push(current);
        current = "";
        used = 0;
      }
      if (next > width && current.length === 0) {
        lines.push(fitLine(char, width));
        continue;
      }
      current += char;
      used += next;
    }
    if (current.length > 0 || used === 0) lines.push(current);
  }
  return lines;
}

export function clipWidgetLines(lines: string[], width = WIDGET_LINE_MAX): string[] {
  return lines.map((line) => fitLine(line, width));
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
