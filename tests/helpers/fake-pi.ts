import type { ExtensionAPI, ExtensionContext, RegisteredCommand, RegisteredTool } from "../../src/pi-api.ts";

export interface FakePi extends ExtensionAPI {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
  active: string[];
  answers: string[];
  notifications: string[];
  ctx: ExtensionContext;
  /**
   * Event handlers, recorded rather than discarded.
   *
   * The extension's most consequential behaviour is a `before_agent_start` hook that
   * replaces the system prompt, and a no-op `on()` made that untestable - which is part
   * of why "the agent is a coding agent wearing a browser hat" survived so long.
   */
  handlers: Map<string, (event: unknown) => unknown>;
}

export function createFakePi(answers: string[] = []): FakePi {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const notifications: string[] = [];
  const handlers = new Map<string, (event: unknown) => unknown>();
  const pending = [...answers];
  let active = ["read", "bash", "write", "edit"];

  const ctx: ExtensionContext = {
    cwd: process.cwd(),
    ui: {
      notify(message) {
        notifications.push(message);
      },
      async input(_title, _placeholder) {
        return pending.shift();
      },
      async confirm() {
        return true;
      },
      async select(_title, options) {
        return options[0];
      },
    },
  };

  return {
    tools,
    commands,
    get active() {
      return active;
    },
    set active(value) {
      active = value;
    },
    answers: pending,
    notifications,
    handlers,
    ctx,
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on(event, handler) {
      handlers.set(event as string, handler as (value: unknown) => unknown);
    },
    getActiveTools() {
      return [...active];
    },
    getAllTools() {
      return [...tools.keys()].map((name) => ({ name }));
    },
    setActiveTools(names) {
      active = [...names];
    },
  };
}

export async function runCommand(pi: FakePi, name: string, args = ""): Promise<void> {
  const command = pi.commands.get(name);
  if (!command) throw new Error(`Missing command ${name}`);
  await command.handler(args, pi.ctx);
}

export async function runTool(
  pi: FakePi,
  name: string,
  params: Record<string, unknown> = {},
) {
  const tool = pi.tools.get(name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool.execute("call-1", params, undefined, undefined, pi.ctx);
}
