export interface ToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
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
