/**
 * Dedicated subagent renderer. The generic tool view collapses a running child to
 * one summary line; the operator then cannot tell which task is live, which tool
 * the child is on, or how long it has been going. This is the Pi bundled-subagent
 * layout (call preview, live status, expanded task/tools/output) drawn with Magpi's
 * width-safe Component so pi-tui never enters the package graph.
 */

import { fitLine, wrapToWidth } from "../pi-tool-view.ts";
import type { Component, ToolRenderResultOptions } from "../../pi-api.ts";
import { formatElapsed, liveStatusLine, previewTask } from "./progress.ts";

const COLLAPSED_TOOLS = 8;
const EXPANDED_TOOLS = 40;

export interface SubagentViewDetails {
  agent?: string;
  task?: string;
  running?: boolean;
  elapsedMs?: number;
  timeoutMs?: number;
  tools?: string[];
  latestTool?: string;
  turns?: number;
  model?: string;
  usage?: string;
  aborted?: boolean;
  exitCode?: number;
  halt?: boolean;
  workStream?: string;
  output?: string;
  errorMessage?: string;
}

export interface SubagentTheme {
  fg?(color: string, text: string): string;
  bold?(text: string): string;
}

export function paint(theme: unknown, color: string, text: string): string {
  const t = theme as SubagentTheme | undefined;
  return t?.fg ? t.fg(color, text) : text;
}

export function paintBold(theme: unknown, text: string): string {
  const t = theme as SubagentTheme | undefined;
  return t?.bold ? t.bold(text) : text;
}

export function formatToolPreview(name: string, args?: Record<string, unknown>): string {
  if (name === "bash") {
    const command = typeof args?.command === "string" ? args.command : "";
    const preview = command ? previewTask(command, 60) : "...";
    return `$ ${preview}`;
  }
  if (name === "read" || name === "write" || name === "edit") {
    const file = String(args?.file_path ?? args?.path ?? "...");
    return `${name} ${previewTask(file, 50)}`;
  }
  if (name === "grep" || name === "find") {
    const pattern = String(args?.pattern ?? "*");
    return `${name} ${previewTask(pattern, 40)}`;
  }
  if (name === "ls") {
    return `ls ${String(args?.path ?? ".")}`;
  }
  return name;
}

export function renderSubagentCall(args: Record<string, unknown>, theme: unknown): Component {
  const agent = typeof args.agent === "string" ? args.agent : "...";
  const task = typeof args.task === "string" ? args.task : "...";
  const title = `${paint(theme, "toolTitle", paintBold(theme, "subagent"))} ${paint(theme, "accent", agent)}`;
  const preview = paint(theme, "dim", previewTask(task, 80));
  return {
    render: (width) => [fitLine(title, width), fitLine(`  ${preview}`, width)],
  };
}

export function renderSubagentResult(
  result: { content?: unknown; details?: unknown; isError?: boolean },
  options: ToolRenderResultOptions,
  theme: unknown,
): Component {
  const details = asDetails(result.details);
  const failed = result.isError === true || details.aborted === true || details.halt === true
    || (typeof details.exitCode === "number" && details.exitCode !== 0);
  const icon = details.running ? "⏳" : failed ? "✗" : "✓";
  const agent = details.agent ?? "worker";
  const status = liveStatusLine({
    agent,
    elapsedMs: details.elapsedMs ?? 0,
    timeoutMs: details.timeoutMs,
    latestTool: details.latestTool,
    turns: details.turns,
    usage: details.usage,
    running: details.running,
    workStream: details.workStream,
  });
  const header = `${icon} ${paint(theme, failed ? "error" : "toolTitle", paintBold(theme, status))}`;

  if (!options.expanded && !options.isPartial) {
    const extra: string[] = [header];
    if (details.task) extra.push(paint(theme, "dim", previewTask(details.task, 90)));
    if (details.latestTool) extra.push(paint(theme, "muted", `→ ${details.latestTool}`));
    if (details.usage) extra.push(paint(theme, "dim", details.usage));
    if (failed && details.errorMessage) extra.push(paint(theme, "error", details.errorMessage));
    return { render: (width) => extra.map((line) => fitLine(line, width)) };
  }

  if (options.isPartial && !options.expanded) {
    const tools = (details.tools ?? []).slice(-COLLAPSED_TOOLS);
    const lines = [header];
    if (details.task) lines.push(paint(theme, "dim", previewTask(details.task, 90)));
    if (details.usage) lines.push(paint(theme, "dim", details.usage));
    for (const tool of tools) lines.push(paint(theme, "muted", `→ ${tool}`));
    return { render: (width) => lines.map((line) => fitLine(line, width)) };
  }

  return {
    render: (width) => {
      const lines: string[] = [header];
      if (details.halt) lines.push(paint(theme, "warning", "Automatic dispatch stopped"));
      if (details.task) {
        lines.push(paint(theme, "muted", "─── Task ───"));
        lines.push(...wrapToWidth(details.task, width));
      }
      const tools = (details.tools ?? []).slice(-EXPANDED_TOOLS);
      if (tools.length > 0) {
        lines.push(paint(theme, "muted", "─── Tools ───"));
        for (const tool of tools) lines.push(paint(theme, "muted", `→ ${tool}`));
      }
      const output = details.output ?? textFromContent(result.content);
      if (output) {
        lines.push(paint(theme, "muted", "─── Output ───"));
        lines.push(...wrapToWidth(output, width).slice(0, 80));
      }
      if (details.errorMessage) {
        lines.push(paint(theme, "error", details.errorMessage));
      }
      if (details.usage || details.model) {
        lines.push(paint(theme, "dim", [details.usage, details.model].filter(Boolean).join(" ")));
      }
      if (typeof details.elapsedMs === "number") {
        lines.push(paint(theme, "dim", `elapsed ${formatElapsed(details.elapsedMs)}`));
      }
      return lines.map((line) => fitLine(line, width));
    },
  };
}

function asDetails(value: unknown): SubagentViewDetails {
  return value && typeof value === "object" ? (value as SubagentViewDetails) : {};
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text"),
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}
