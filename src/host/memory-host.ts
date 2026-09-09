import { BROWSER_TOOL_NAMES } from "../domain/types.ts";
import type {
  CustomSessionMessage,
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
  RegisteredTool,
  SendMessageOptions,
  SendUserMessageOptions,
} from "../pi-api.ts";
import type { OperatorHost, UiRequest } from "./types.ts";

export type HostListener = {
  onNotify?: (message: string, level: string) => void;
  onUiRequest?: (request: UiRequest) => void;
  onToolsChanged?: (names: string[]) => void;
  onUserMessage?: (text: string) => void;
};

export class MemoryOperatorHost implements OperatorHost {
  active: string[] = [];
  private pending = new Map<string, { resolve: (value: unknown) => void }>();
  private seq = 0;
  listeners: HostListener = {};

  notify(message: string, level: "info" | "warning" | "error" = "info"): void {
    this.listeners.onNotify?.(message, level);
  }

  input(title: string, placeholder?: string): Promise<string | undefined> {
    return this.ask({ kind: "input", title, placeholder });
  }

  confirm(title: string, message: string): Promise<boolean> {
    return this.ask({ kind: "confirm", title, message });
  }

  select(title: string, options: string[]): Promise<string | undefined> {
    return this.ask({ kind: "select", title, options });
  }

  getActiveTools(): string[] {
    return [...this.active];
  }

  setActiveTools(names: string[]): void {
    this.active = [...names];
    this.listeners.onToolsChanged?.(this.getActiveTools());
  }

  getAllTools(): Array<{ name: string }> {
    return this.active.map((name) => ({ name }));
  }

  answer(requestId: string, value: unknown): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.resolve(value);
  }

  private ask<T>(partial: Omit<UiRequest, "requestId">): Promise<T> {
    const requestId = `ui_${++this.seq}`;
    const request = { ...partial, requestId } as UiRequest;
    const promise = new Promise<T>((resolve) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void });
    });
    this.listeners.onUiRequest?.(request);
    return promise;
  }
}

export function createExtensionApi(
  host: OperatorHost,
  extras?: { tools?: Map<string, RegisteredTool> },
): ExtensionAPI & {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
  emit: (event: string, payload?: unknown, ctx?: ExtensionContext) => Promise<unknown[]>;
} {
  const tools = extras?.tools ?? new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();

  const emit = async (event: string, payload?: unknown, ctx?: ExtensionContext): Promise<unknown[]> => {
    const context = ctx ?? extensionContext(host);
    const results: unknown[] = [];
    let current = payload;
    for (const handler of handlers.get(event) ?? []) {
      const result = await handler(current, context);
      results.push(result);
      const messages = (result as { messages?: unknown } | undefined)?.messages;
      if (Array.isArray(messages) && current && typeof current === "object") {
        current = { ...(current as object), messages };
      }
    }
    return results;
  };

  const api: ExtensionAPI & {
    tools: Map<string, RegisteredTool>;
    commands: Map<string, RegisteredCommand>;
    emit: typeof emit;
  } = {
    tools,
    commands,
    emit,
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    getActiveTools() {
      return host.getActiveTools();
    },
    getAllTools() {
      const names = new Set([...tools.keys(), ...host.getAllTools().map((t) => t.name)]);
      return [...names].map((name) => ({ name }));
    },
    setActiveTools(names) {
      host.setActiveTools(names);
    },
    sendMessage(message: CustomSessionMessage, options?: SendMessageOptions) {
      if (options?.triggerTurn) {
        host.notify(message.content, "info");
        (host as MemoryOperatorHost).listeners.onUserMessage?.(message.content);
      } else if (message.display) {
        host.notify(message.content, "info");
      }
    },
    sendUserMessage(content: string, _options?: SendUserMessageOptions) {
      (host as MemoryOperatorHost).listeners.onUserMessage?.(content);
    },
    appendEntry() {
      /* hosted chat has no Pi session file; local TUI implements this on real Pi. */
    },
  };
  return api;
}

export function extensionContext(host: OperatorHost, cwd = process.cwd()): ExtensionContext {
  return {
    cwd,
    hasUI: true,
    ui: {
      notify: (message, level) => host.notify(message, level),
      input: (title, placeholder) => host.input(title, placeholder),
      confirm: (title, message) => host.confirm(title, message),
      select: (title, options) => host.select(title, options),
      setStatus: (id, text) => {
        if (text) host.notify(`${id}: ${text}`, "info");
      },
      setWorkingMessage: (message) => {
        if (message) host.notify(`working: ${message}`, "info");
      },
      setWidget: (key, content) => {
        if (content) host.notify(`${key}: ${content.join(" | ")}`, "info");
      },
      editor: (title, _prefill) => host.input(title, "What should change?"),
    },
  };
}

export function browserOnlyTools(): string[] {
  return [...BROWSER_TOOL_NAMES];
}
