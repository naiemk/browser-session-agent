export interface ToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
  /**
   * Pi stops the agent after this tool batch only when every result in the batch
   * sets this. Used to hand control back after a stalled coder stream.
   */
  terminate?: boolean;
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
  /** Pi sequential/parallel override. Coder children stay sequential. */
  executionMode?: "sequential" | "parallel";
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<ToolResult>;
  renderCall?: (args: Record<string, unknown>, theme: unknown, context: unknown) => Component;
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

export interface CustomSessionMessage {
  customType: string;
  content: string;
  display?: boolean;
  details?: unknown;
}

export interface SendMessageOptions {
  triggerTurn?: boolean;
  deliverAs?: "steer" | "followUp" | "nextTurn";
}

export interface SendUserMessageOptions {
  deliverAs?: "steer" | "followUp";
}

export interface ExtensionContext {
  cwd?: string;
  /** True in TUI and hosted chat. Plan-mode Execute/Stay/Refine needs it. */
  hasUI?: boolean;
  /** Present on real Pi; used to restore plan-mode across resume. */
  sessionManager?: {
    getEntries(): Array<{
      type?: string;
      customType?: string;
      data?: unknown;
      message?: unknown;
    }>;
  };
  ui: {
    notify(message: string, level?: "info" | "warning" | "error"): void;
    input(title: string, placeholder?: string): Promise<string | undefined>;
    confirm(title: string, message: string): Promise<boolean>;
    select(title: string, options: string[]): Promise<string | undefined>;
    setStatus?(id: string, text: string | undefined): void;
    /** Pi footer working line while a child is live. Omit to restore the default. */
    setWorkingMessage?(message?: string): void;
    setWidget?(key: string, content: string[] | undefined): void;
    editor?(title: string, prefill?: string): Promise<string | undefined>;
  };
}

export interface ExtensionAPI {
  registerTool(tool: RegisteredTool): void;
  registerCommand(name: string, command: RegisteredCommand): void;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  getActiveTools(): string[];
  getAllTools(): Array<{ name: string }>;
  setActiveTools(names: string[]): void;
  sendMessage?(message: CustomSessionMessage, options?: SendMessageOptions): void;
  sendUserMessage?(content: string, options?: SendUserMessageOptions): void;
  appendEntry?(customType: string, data?: unknown): void;
}

export function textResult(text: string, details: Record<string, unknown> = {}, isError = false): ToolResult {
  return {
    content: [{ type: "text", text }],
    details,
    isError,
  };
}
