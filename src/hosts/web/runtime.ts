import { createAgentSession, defineTool, getAgentDir, ModelRegistry, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { bindBrowserCommands } from "../../host/bind-extension.ts";
import { fileEvidence } from "../../host/evidence.ts";
import { shortId } from "../../core/ids.ts";
import { composeAgent } from "../../runtime/agent.ts";
import { TOOL_OBSERVE } from "../../runtime/names.ts";
import { RpcBrowserPort } from "../shared/port-rpc.ts";
import { createExtensionApi, extensionContext, MemoryOperatorHost } from "../../host/memory-host.ts";
import { RpcSessionHandle } from "../../host/session-handle.ts";
import type { ExtensionAPI, RegisteredTool } from "../../pi-api.ts";
import type { ChatClientMessage, ChatServerMessage, OperatorState } from "../shared/protocol.ts";
import { resolveCostExtensions } from "./pi-packages.ts";
import { applyHostedApiKeys, assistantErrorFromEvent, capHostedModelOutput } from "./hosted-pi.ts";
import type { NodeHub } from "./hub.ts";
import { AgentError } from "../../domain/types.ts";

export interface OperatorRuntimeOptions {
  cwd?: string;
  agentDir?: string;
  sessionDir?: string;
  requirePaid?: boolean;
  paid?: boolean | (() => boolean);
  /** Test-only: delay before Pi boot. Does not block chat hello. */
  startDelayMs?: number;
  /** Fail the wait for start() after this many ms. Boot may still finish later. */
  startTimeoutMs?: number;
}

let piStartLock: Promise<void> = Promise.resolve();

function withPiStartLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = piStartLock.then(fn, fn);
  piStartLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OperatorRuntime {
  readonly host = new MemoryOperatorHost();
  /**
   * The browser agent's system prompt, replacing the coding identity rather than being
   * appended to it. Set when the session boots, because it is composed there.
   */
  private browserPrompt: string | null = null;
  /** The composed tools, by name, so the CI double drives the same agent. */
  private browserTools = new Map<string, { name: string; execute: (id: string, params: unknown) => Promise<unknown> }>();
  readonly api: ExtensionAPI & {
    tools: Map<string, import("../../pi-api.ts").RegisteredTool>;
    commands: Map<string, import("../../pi-api.ts").RegisteredCommand>;
  };
  readonly handle: RpcSessionHandle;
  private pi: PiLike | null = null;
  private modelRegistry: ModelRegistry | null = null;
  private unsubscribePi: (() => void) | null = null;
  private send: (message: ChatServerMessage) => void;
  private readonly hub: NodeHub;
  private readonly options: OperatorRuntimeOptions;
  private startPromise: Promise<void> | null = null;
  piReady = false;
  piReason: string | null = null;

  get starting(): boolean {
    return this.startPromise !== null && !this.piReady && this.piReason === null;
  }
  sessionId = `sess_${Date.now().toString(36)}`;
  /**
   * The goal this chat's evidence is filed under.
   *
   * Separate from `sessionId`, which is reassigned when the operator starts a new
   * session: evidence already written must not be orphaned by a later rename.
   */
  readonly evidenceGoalId = shortId("goal");
  model = "auto";
  thinking = "medium";
  private models: Array<{ id: string; label: string }> = [
    { id: "auto", label: "Pi Router (Auto)" },
    { id: "low", label: "@low" },
    { id: "medium", label: "@medium" },
    { id: "high", label: "@high" },
    { id: "ultra", label: "@ultra" },
  ];

  constructor(hub: NodeHub, send: (message: ChatServerMessage) => void, options: OperatorRuntimeOptions = {}) {
    this.hub = hub;
    this.send = send;
    this.options = options;
    this.handle = new RpcSessionHandle(hub);
    const startRun = this.handle.startRun.bind(this.handle);
    this.handle.startRun = async (goal: string, startUrl?: string) => {
      if (this.options.requirePaid && !this.isPaid()) {
        throw new AgentError("payment_required", "Pay to start a browser run.");
      }
      return startRun(goal, startUrl);
    };
    this.api = createExtensionApi(this.host);
    // Commands only. The tools come from composeAgent when the session boots, so the
    // chat runs the same agent as the CLI and the suite rather than a parallel one.
    bindBrowserCommands(this.api, this.handle);
    this.api.on("before_agent_start", () =>
      this.browserPrompt ? { systemPrompt: this.browserPrompt } : undefined,
    );
    this.host.listeners = {
      onNotify: (message, level) => this.send({ type: "notify", message, level }),
      onUiRequest: (request) => this.send({ type: "ui_request", ...request }),
      onToolsChanged: () => this.send({ type: "stateSync", state: this.state() }),
    };
  }

  setSend(send: (message: ChatServerMessage) => void): void {
    this.send = send;
  }

  state(): OperatorState {
    return {
      sessionId: this.sessionId,
      model: this.model,
      thinking: this.thinking,
      activeTools: this.host.getActiveTools(),
      nodeConnected: this.hub.connected,
      takeover: this.hub.takeover,
      currentRunId: this.handle.currentRunId,
    };
  }

  private isPaid(): boolean {
    const paid = this.options.paid;
    return typeof paid === "function" ? paid() : Boolean(paid);
  }

  async start(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.startOnce();
    return this.startPromise;
  }

  private async startOnce(): Promise<void> {
    if (this.options.startDelayMs && this.options.startDelayMs > 0) {
      await sleep(this.options.startDelayMs);
    }
    if (process.env.BSA_NO_PI === "1") {
      this.piReady = false;
      this.piReason = "BSA_NO_PI";
      this.send({ type: "models", models: this.models });
      this.send({ type: "stateSync", state: this.state() });
      return;
    }
    if (process.env.BSA_FAKE_PI === "1") {
      // Compose first: the double calls the real tools, so it exercises the agent the
      // operator gets rather than a stub that only resembles one.
      this.composeBrowserAgent();
      this.pi = this.createFakePi();
      this.piReady = true;
      this.piReason = null;
      this.model = "fake/scripted";
      this.models = [
        ...this.models,
        { id: "fake/scripted", label: "fake/scripted (CI double)" },
      ];
      this.send({ type: "models", models: this.models });
      this.send({ type: "stateSync", state: this.state() });
      return;
    }
    const timeoutMs = this.options.startTimeoutMs
      ?? Number(process.env.BSA_PI_START_TIMEOUT_MS ?? 20_000);
    const boot = this.bootPi();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const winner = await Promise.race([boot.then(() => "ok" as const), timeout]);
    if (timer) clearTimeout(timer);
    if (winner === "timeout" && !this.piReady && this.piReason === null) {
      this.piReason = `Pi start timed out after ${timeoutMs}ms`;
      this.sendPiUnavailable();
      this.send({ type: "models", models: this.models });
      this.send({ type: "stateSync", state: this.state() });
      void boot.then(() => {
        if (!this.piReady) return;
        this.send({ type: "notify", message: "Agent is ready.", level: "info" });
        this.send({ type: "models", models: this.models });
        this.send({ type: "stateSync", state: this.state() });
      });
    }
  }

  private async bootPi(): Promise<void> {
    try {
      if (process.env.BSA_PI_FAIL === "1") {
        throw new Error("BSA_PI_FAIL");
      }
      await withPiStartLock(async () => {
        const { DefaultResourceLoader } = await import("@earendil-works/pi-coding-agent");
        const modelRuntime = await ModelRuntime.create({
          refreshOnCreate: false,
        });
        await applyHostedApiKeys(modelRuntime);
        this.modelRegistry = new ModelRegistry(modelRuntime);
        const extras = await resolveCostExtensions();
        const cwd = this.options.cwd ?? process.cwd();
        const agentDir = this.options.agentDir ?? getAgentDir();
        const loader = new DefaultResourceLoader({ cwd, agentDir, additionalExtensionPaths: extras });
        await loader.reload();

        /*
         * The same agent the CLI and the suite run.
         *
         * This used to be a coding agent with a browser paragraph appended and its own
         * parallel `browser_*` tools. The identity is now replaced rather than extended
         * (see the before_agent_start hook), and the tools come from `composeAgent`, so
         * perception, verification, peeking and forks are the ones that are measured.
         *
         * `createAgentSession` stays as the *engine*: it brings the model registry,
         * thinking levels, compaction and session files, which a chat needs and a bounded
         * task does not. What the agent is, and what drives it, are different questions.
         */
        const customTools = this.composeBrowserAgent().map((tool) => this.toPiTool(tool as never));
        const result = await createAgentSession({
          cwd,
          agentDir,
          modelRuntime,
          resourceLoader: loader,
          sessionManager: this.options.sessionDir
            ? SessionManager.create(cwd, this.options.sessionDir)
            : SessionManager.inMemory(cwd),
          customTools,
          noTools: "builtin",
          thinkingLevel: "medium",
        });
        this.pi = result.session as PiLike;
        this.piReady = true;
        this.piReason = null;
        this.capPiModel();
        this.model = describeModel(result.session.model) ?? this.model;
        this.thinking = String(result.session.thinkingLevel ?? this.thinking);
        this.unsubscribePi = result.session.subscribe((event) => {
          this.send({ type: "agentEvent", event: normalizeAgentEvent(event) });
          const err = assistantErrorFromEvent(event);
          if (err) this.send({ type: "error", message: err, code: "pi_turn_error" });
        });
        const available = this.modelRegistry.getAvailable();
        this.models = [
          { id: "auto", label: "Pi Router (Auto)" },
          { id: "low", label: "@low" },
          { id: "medium", label: "@medium" },
          { id: "high", label: "@high" },
          { id: "ultra", label: "@ultra" },
          ...available.map((model) => ({
            id: `${model.provider}/${model.id}`,
            label: `${model.provider}/${model.id}`,
          })),
        ];
      });
    } catch (err) {
      this.pi = null;
      this.piReady = false;
      this.piReason = err instanceof Error ? err.message : String(err);
      this.sendPiUnavailable();
    }
    this.send({ type: "models", models: this.models });
    this.send({ type: "stateSync", state: this.state() });
  }

  private sendPiUnavailable(): void {
    this.send({
      type: "notify",
      message: `Pi agent is not running (${this.piReason ?? "unavailable"}). Chat cannot answer until LLM keys are configured on the API. Slash commands and pairing still work.`,
      level: "warning",
    });
  }

  async handleClient(message: ChatClientMessage): Promise<void> {
    switch (message.type) {
      case "hello":
        this.send({ type: "hello_ok", protocol: 1 });
        this.send({ type: "models", models: this.models });
        this.send({ type: "stateSync", state: this.state() });
        this.send({
          type: "nodeStatus",
          connected: this.hub.connected,
          takeover: this.hub.takeover,
          reason: this.hub.connected ? undefined : "browser node disconnected",
        });
        if (this.hub.connected) this.hub.startScreencast();
        if (!this.piReady && process.env.BSA_NO_PI !== "1") {
          if (this.starting) {
            this.send({ type: "notify", message: "Starting the agent…", level: "info" });
          } else {
            this.sendPiUnavailable();
          }
        }
        return;
      case "prompt":
        await this.prompt(message.text);
        return;
      case "abort":
        await this.pi?.abort();
        return;
      case "setModel":
        await this.setModel(message.model);
        return;
      case "setThinking":
        this.thinking = message.level;
        this.pi?.setThinkingLevel(message.level as "off" | "minimal" | "low" | "medium" | "high" | "xhigh");
        this.send({ type: "stateSync", state: this.state() });
        return;
      case "command":
        await this.runCommand(message.name, message.args ?? "");
        return;
      case "ui_answer":
        this.host.answer(message.requestId, message.value);
        return;
      case "takeover_input":
        try {
          this.hub.forwardTakeoverInput(message.event);
        } catch (err) {
          const error = err instanceof AgentError ? err : undefined;
          this.send({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
            code: error?.code,
          });
        }
        return;
      case "newSession":
        this.sessionId = `sess_${Date.now().toString(36)}`;
        this.send({ type: "stateSync", state: this.state() });
        return;
      case "loadSession":
        this.send({ type: "notify", message: "Session resume uses the same ~/.pi/agent/sessions as the TUI when configured.", level: "info" });
        return;
    }
  }

  async dispose(): Promise<void> {
    this.unsubscribePi?.();
    this.pi?.dispose();
    this.pi = null;
  }

  private async prompt(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      const [name, ...rest] = trimmed.slice(1).split(/\s+/);
      await this.runCommand(name ?? "", rest.join(" "));
      return;
    }
    if (!this.hub.connected && looksLikeBrowserWork(trimmed)) {
      this.send({
        type: "notify",
        message: "Browser node disconnected. Chat can continue, but browser tools will fail until the desktop node reconnects.",
        level: "warning",
      });
    }
    if (!this.pi) {
      if (process.env.BSA_NO_PI === "1") {
        this.send({
          type: "agentEvent",
          event: { type: "text_delta", text: stubReply(trimmed) },
        });
        this.send({ type: "agentEvent", event: { type: "turn_end" } });
        return;
      }
      this.sendPiUnavailable();
      this.send({
        type: "error",
        message: `Pi agent is not running (${this.piReason ?? "unavailable"}). Configure LLM keys on the API.`,
        code: "pi_unavailable",
      });
      return;
    }
    try {
      this.capPiModel();
      await this.pi.prompt(trimmed);
    } catch (err) {
      this.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        code: "pi_prompt_failed",
      });
    }
  }

  private capPiModel(): void {
    capHostedModelOutput(this.pi?.model);
    capHostedModelOutput(this.pi?.agent?.state?.model);
  }

  private async runCommand(name: string, args: string): Promise<void> {
    const key = name.replace(/^\//, "");
    if (key === "browser-status" && !this.hub.connected) {
      this.send({
        type: "notify",
        message: JSON.stringify(
          {
            nodeConnected: false,
            hint: "Pair this computer, then run the curl installer on that machine. Chat still works without the desktop node.",
            currentRun: null,
            runs: [],
          },
          null,
          2,
        ),
        level: "info",
      });
      return;
    }
    const command = this.api.commands.get(key);
    if (!command) {
      this.send({ type: "error", message: `Unknown command /${key}` });
      return;
    }
    try {
      await command.handler(args, extensionContext(this.host));
      this.send({ type: "stateSync", state: this.state() });
    } catch (err) {
      const error = err instanceof AgentError ? err : undefined;
      this.send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        code: error?.code,
      });
    }
  }

  /**
   * The agent the operator talks to: the same tools and the same prompt the CLI and the
   * suite use, pointed at the browser on their desktop over RPC.
   */
  private composeBrowserAgent() {
    const composed = composeAgent({
      card: {
        objective:
          "Help the operator with what they ask, in their browser. They judge whether it " +
          "worked, so report truthfully and never claim more than you verified.",
        criteria: [],
        policy: "ask",
      },
      tools: {
        browser: new RpcBrowserPort({ call: (method, args) => this.hub.call(method, args) }),
        askUser: async (question) => this.host.input(question),
        // A chat session is the goal here, same as in the local CLI: the operator's
        // objective spans whatever runs they start inside the conversation.
        evidence: fileEvidence({ goalId: this.evidenceGoalId, goal: "hosted chat session" }),
      },
    });
    this.browserPrompt = composed.systemPrompt;
    this.browserTools = new Map(
      composed.tools.map((tool) => [
        (tool as { name: string }).name,
        tool as unknown as { name: string; execute: (id: string, params: unknown) => Promise<unknown> },
      ]),
    );
    return composed.tools;
  }

  /** The agent's tool names, for the chat UI and for tests that assert the surface. */
  browserToolNames(): string[] {
    return [...this.browserTools.keys()];
  }

  private createFakePi(): PiLike {
    return {
      model: { provider: "fake", id: "scripted" },
      thinkingLevel: "medium",
      subscribe: () => () => undefined,
      abort: () => undefined,
      dispose: () => undefined,
      setThinkingLevel: () => undefined,
      setModel: async () => undefined,
      prompt: async (text: string) => {
        const tools = [...this.browserTools.keys()];
        this.send({
          type: "agentEvent",
          event: { type: "text_delta", text: `Pi: ${text}` },
        });
        if (looksLikeBrowserWork(text)) {
          // The double drives the real composed tool, so a test that says "the chat can
          // look at a page" is testing the agent the operator gets.
          const observe = this.browserTools.get(TOOL_OBSERVE);
          this.send({
            type: "agentEvent",
            event: { type: "tool_call", toolName: TOOL_OBSERVE, tools },
          });
          if (observe) {
            try {
              const result = (await observe.execute("fake-pi", {})) as {
                isError?: boolean;
                content: Array<{ text?: string }>;
              };
              this.send({
                type: "agentEvent",
                event: {
                  type: "tool_result",
                  toolName: TOOL_OBSERVE,
                  isError: Boolean(result.isError),
                  text: result.content.map((part) => part.text ?? "").join(""),
                },
              });
            } catch (err) {
              this.send({
                type: "agentEvent",
                event: {
                  type: "tool_result",
                  toolName: TOOL_OBSERVE,
                  isError: true,
                  text: err instanceof Error ? err.message : String(err),
                },
              });
            }
          }
        }
        this.send({ type: "agentEvent", event: { type: "turn_end" } });
      },
    };
  }

  private async setModel(id: string): Promise<void> {
    this.model = id;
    if (this.pi && this.modelRegistry && id !== "auto" && !["low", "medium", "high", "ultra"].includes(id)) {
      const [provider, ...rest] = id.split("/");
      const found = this.modelRegistry.find(provider ?? "", rest.join("/"));
      if (found) {
        capHostedModelOutput(found as { maxTokens?: number });
        await this.pi.setModel?.(found);
        this.capPiModel();
      }
    }
    this.send({ type: "stateSync", state: this.state() });
    this.send({
      type: "notify",
      message: id === "auto" || ["low", "medium", "high", "ultra"].includes(id)
        ? `Routing hint ${id}. pi-model-auto picks the cheapest authenticated model that meets that floor.`
        : `Model set to ${id}`,
      level: "info",
    });
  }

  private toPiTool(tool: RegisteredTool) {
    return defineTool({
      name: tool.name,
      label: tool.label ?? tool.name,
      description: tool.description,
      parameters: tool.parameters as never,
      execute: async (id, params, signal, onUpdate) => {
        const result = await tool.execute(
          id,
          params as Record<string, unknown>,
          signal,
          onUpdate,
          extensionContext(this.host),
        );
        return { ...result, details: result.details ?? {} };
      },
    });
  }
}

interface PiLike {
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void> | void;
  dispose: () => void;
  setThinkingLevel: (level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
  setModel?: (model: unknown) => Promise<void> | void;
  subscribe?: (listener: (event: unknown) => void) => () => void;
  model?: { provider?: string; id?: string; maxTokens?: number };
  thinkingLevel?: string;
  agent?: { state?: { model?: { maxTokens?: number }; errorMessage?: string } };
}

function describeModel(model: { provider?: string; id?: string } | undefined): string | undefined {
  if (!model?.id) return undefined;
  return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function stubReply(text: string): string {
  return `I heard you: ${text}`;
}

function looksLikeBrowserWork(text: string): boolean {
  return /browser|click|inspect|login|tab|page|navigate|takeover/i.test(text);
}

function normalizeAgentEvent(event: unknown): Record<string, unknown> {
  const value = event as {
    type?: string;
    assistantMessageEvent?: { type?: string; delta?: string };
    message?: unknown;
    toolName?: string;
  };
  if (value.type === "message_update" && value.assistantMessageEvent?.type === "text_delta") {
    return { type: "text_delta", text: value.assistantMessageEvent.delta ?? "" };
  }
  if (value.type) return { ...value };
  return { type: "agentEvent", event };
}
