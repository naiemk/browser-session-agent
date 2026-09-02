import { BROWSER_TOOL_NAMES } from "../domain/types.ts";
import type { ExtensionAPI, ExtensionContext, RegisteredCommand, RegisteredTool } from "../pi-api.ts";
import type { OperatorHost, UiRequest } from "./types.ts";

export type HostListener = {
  onNotify?: (message: string, level: string) => void;
  onUiRequest?: (request: UiRequest) => void;
  onToolsChanged?: (names: string[]) => void;
};

export class MemoryOperatorHost implements OperatorHost {
  active: string[] = [...BROWSER_TOOL_NAMES];
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
): ExtensionAPI & { tools: Map<string, RegisteredTool>; commands: Map<string, RegisteredCommand> } {
  const tools = extras?.tools ?? new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();

  const api: ExtensionAPI & {
    tools: Map<string, RegisteredTool>;
    commands: Map<string, RegisteredCommand>;
  } = {
    tools,
    commands,
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
  };
  return api;
}

export function extensionContext(host: OperatorHost, cwd = process.cwd()): ExtensionContext {
  return {
    cwd,
    ui: {
      notify: (message, level) => host.notify(message, level),
      input: (title, placeholder) => host.input(title, placeholder),
      confirm: (title, message) => host.confirm(title, message),
      select: (title, options) => host.select(title, options),
    },
  };
}

export function browserOnlyTools(): string[] {
  return [...BROWSER_TOOL_NAMES];
}
