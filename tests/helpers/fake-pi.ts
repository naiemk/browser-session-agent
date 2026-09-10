import type {
  CustomSessionMessage,
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
  RegisteredTool,
  SendMessageOptions,
  SendUserMessageOptions,
} from "../../src/pi-api.ts";

export interface FakePi extends ExtensionAPI {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
  active: string[];
  answers: string[];
  notifications: string[];
  userMessages: string[];
  customMessages: CustomSessionMessage[];
  entries: Array<{ customType: string; data?: unknown }>;
  widgets: Map<string, string[] | undefined>;
  statuses: Map<string, string | undefined>;
  workingMessages: Array<string | undefined>;
  thinkingLog: string[];
  modelLog: string[];
  currentModelId(): string | undefined;
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
  handlers: Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>;
  /** End loading and emit `session_start`, the way a real session does. */
  startSession(): Promise<void>;
  /** Fire one event, returning what each handler returned. */
  emit(event: string, payload?: unknown): Promise<unknown[]>;
}

export function createFakePi(answers: string[] = []): FakePi {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const notifications: string[] = [];
  const userMessages: string[] = [];
  const customMessages: CustomSessionMessage[] = [];
  const entries: Array<{ customType: string; data?: unknown }> = [];
  const widgets = new Map<string, string[] | undefined>();
  const statuses = new Map<string, string | undefined>();
  const workingMessages: Array<string | undefined> = [];
  const thinkingLog: string[] = [];
  const modelLog: string[] = [];
  const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>();
  let thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" = "medium";
  let currentModel: { provider: string; id: string } = { provider: "fake", id: "session" };
  const catalog = new Map<string, { provider: string; id: string }>([
    ["fake/session", { provider: "fake", id: "session" }],
    ["test/strong-coach", { provider: "test", id: "strong-coach" }],
    ["test/plan-opus", { provider: "test", id: "plan-opus" }],
  ]);
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

  /*
   * Handlers see what the handler before them returned.
   *
   * Pi's runner threads a `context` result through the remaining handlers, so ordering is
   * a contract an extension can rely on: compaction registered before metering is what
   * makes the recorded bytes the bytes that were sent. A double that handed every handler
   * the original event would let that ordering look irrelevant here and be load-bearing
   * in the product.
   */
  const emit = async (event: string, payload?: unknown): Promise<unknown[]> => {
    const results: unknown[] = [];
    let current = payload;
    for (const handler of handlers.get(event) ?? []) {
      const result = await handler(current, ctx);
      results.push(result);
      const messages = (result as { messages?: unknown } | undefined)?.messages;
      if (Array.isArray(messages) && current && typeof current === "object") {
        current = { ...(current as object), messages };
      }
    }
    return results;
  };

  const ctx: ExtensionContext = {
    cwd: process.cwd(),
    hasUI: true,
    get model() {
      return currentModel;
    },
    modelRegistry: {
      find(provider, modelId) {
        return catalog.get(`${provider}/${modelId}`);
      },
      getAvailable() {
        return [...catalog.values()];
      },
    },
    sessionManager: {
      getEntries() {
        const messages = userMessages.map((content) => ({
          type: "message" as const,
          message: { role: "user" as const, content },
        }));
        const custom = entries.map((entry) => ({
          type: "custom" as const,
          customType: entry.customType,
          data: entry.data,
        }));
        return [...messages, ...custom];
      },
    },
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
      setStatus(id, text) {
        statuses.set(id, text);
      },
      setWorkingMessage(message) {
        workingMessages.push(message);
      },
      setWidget(key, content) {
        widgets.set(key, content);
      },
      async editor(_title, _prefill) {
        return pending.shift();
      },
    },
  };

  const api: FakePi = {
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
    userMessages,
    customMessages,
    entries,
    widgets,
    statuses,
    workingMessages,
    thinkingLog,
    modelLog,
    currentModelId() {
      return `${currentModel.provider}/${currentModel.id}`;
    },
    get thinkingLevel() {
      return thinkingLevel;
    },
    getThinkingLevel() {
      return thinkingLevel;
    },
    setThinkingLevel(level) {
      thinkingLevel = level;
      thinkingLog.push(level);
    },
    async setModel(model) {
      const record = model as { provider?: string; id?: string };
      if (!record?.provider || !record?.id) return false;
      currentModel = { provider: record.provider, id: record.id };
      modelLog.push(`${record.provider}/${record.id}`);
      return true;
    },
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
      list.push(handler as (value: unknown, context: ExtensionContext) => unknown);
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
    sendMessage(message: CustomSessionMessage, options?: SendMessageOptions) {
      customMessages.push(message);
      if (options?.triggerTurn) userMessages.push(message.content);
    },
    sendUserMessage(content: string, _options?: SendUserMessageOptions) {
      userMessages.push(content);
    },
    appendEntry(customType, data) {
      entries.push({ customType, data });
    },
  };

  return api;
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
  try {
    return await tool.execute("call-1", params, undefined, undefined, pi.ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error && typeof error === "object" && "details" in error
      ? (error as { details?: Record<string, unknown> }).details
      : undefined;
    return {
      content: [{ type: "text" as const, text: message }],
      details: details ?? { error: message },
      isError: true,
    };
  }
}
