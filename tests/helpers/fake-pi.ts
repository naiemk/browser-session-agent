import type { ExtensionAPI, ExtensionContext, RegisteredCommand, RegisteredTool } from "../../src/pi-api.ts";

export interface FakePi extends ExtensionAPI {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
  active: string[];
  answers: string[];
  notifications: string[];
  ctx: ExtensionContext;
  /**
   * Event handlers, recorded rather than discarded, and many per event.
   *
   * The extension's most consequential behaviour is a `before_agent_start` hook that
   * replaces the system prompt, and a no-op `on()` made that untestable - which is part
   * of why "the agent is a coding agent wearing a browser hat" survived so long.
   *
   * A list per event, because Pi keeps a list: the extension registers two `session_start`
   * handlers, and a double that kept only the last would silently drop one.
   */
  handlers: Map<string, Array<(event: unknown) => unknown>>;
  /** End loading and emit `session_start`, the way a real session does. */
  startSession(): Promise<void>;
  /** Fire one event, returning what each handler returned. */
  emit(event: string, payload?: unknown): Promise<unknown[]>;
}

export function createFakePi(answers: string[] = []): FakePi {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const notifications: string[] = [];
  const handlers = new Map<string, Array<(event: unknown) => unknown>>();
  const pending = [...answers];
  let active = ["read", "bash", "write", "edit"];
  let loading = true;

  /*
   * Pi's loader gives an extension throwing stubs for action methods and swaps in the
   * real ones once the session is bound, so calling one while loading is a crash rather
   * than an early success. A permissive double hid exactly that: setting active tools at
   * load time passed every test here and then failed on the operator's first launch.
   */
  const whileLoading = (method: string) => {
    if (loading) {
      throw new Error(
        `Extension runtime not initialized. Action methods cannot be called during ` +
          `extension loading (${method}).`,
      );
    }
  };

  const emit = async (event: string, payload?: unknown): Promise<unknown[]> => {
    const results: unknown[] = [];
    for (const handler of handlers.get(event) ?? []) {
      results.push(await handler(payload));
    }
    return results;
  };

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
    emit,
    async startSession() {
      loading = false;
      await emit("session_start", { type: "session_start", reason: "startup" });
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on(event, handler) {
      const list = handlers.get(event as string) ?? [];
      list.push(handler as (value: unknown) => unknown);
      handlers.set(event as string, list);
    },
    getActiveTools() {
      whileLoading("getActiveTools");
      return [...active];
    },
    getAllTools() {
      whileLoading("getAllTools");
      return [...tools.keys()].map((name) => ({ name }));
    },
    setActiveTools(names) {
      whileLoading("setActiveTools");
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
