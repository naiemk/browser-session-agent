export interface ToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * All a terminal component is: something that can turn a width into lines.
 *
 * Declared here rather than imported from pi-tui so that drawing one line on screen does
 * not put a TUI library in this package's dependency graph.
 */
export interface Component {
  render(width: number): string[];
}

export interface ToolRenderResultOptions {
  expanded: boolean;
  isPartial: boolean;
}

export interface RegisteredTool {
  name: string;
  label?: string;
  description: string;
  parameters: unknown;
  promptSnippet?: string;
  promptGuidelines?: string[];
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<ToolResult>;
  /**
   * How the result is drawn, as opposed to what the model is told.
   *
   * Without this the host prints the model-facing text, which for a page snapshot is
   * hundreds of characters of JSON. The payload is unchanged; only the drawing differs.
   */
  renderResult?: (
    result: { content?: unknown; details?: unknown; isError?: boolean },
    options: ToolRenderResultOptions,
    theme: unknown,
    context: unknown,
  ) => Component;
}

export interface RegisteredCommand {
  description: string;
  handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
}

export interface ExtensionContext {
  cwd?: string;
  ui: {
    notify(message: string, level?: "info" | "warning" | "error"): void;
    input(title: string, placeholder?: string): Promise<string | undefined>;
    confirm(title: string, message: string): Promise<boolean>;
    select(title: string, options: string[]): Promise<string | undefined>;
    setStatus?(id: string, text: string): void;
  };
}

export interface ExtensionAPI {
  registerTool(tool: RegisteredTool): void;
  registerCommand(name: string, command: RegisteredCommand): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  getActiveTools(): string[];
  getAllTools(): Array<{ name: string }>;
  setActiveTools(names: string[]): void;
}

export function textResult(text: string, details: Record<string, unknown> = {}, isError = false): ToolResult {
  return {
    content: [{ type: "text", text }],
    details,
    isError,
  };
}
